use crate::db::models::ConversionRule;
use crate::error::AppError;
use crate::modality::chat::ir::{IrChatRequest, IrChatResponse, IrStreamChunk};
use crate::modality::chat::{ChatFormat, Decoder, Encoder};
use crate::rules::engine;
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// A codec provider — either a built-in format or a user-defined JSONata rule.
#[derive(Clone)]
pub enum CodecProvider {
    Builtin(ChatFormat),
    Jsonata(Arc<ConversionRule>),
}

/// Concurrent registry of slug → CodecProvider mappings.
pub struct RuleRegistry {
    entries: RwLock<HashMap<String, CodecProvider>>,
}

impl RuleRegistry {
    /// Create a new registry pre-populated with built-in codecs.
    pub fn new() -> Self {
        let mut map = HashMap::new();
        map.insert("openai-chat".to_string(), CodecProvider::Builtin(ChatFormat::OpenaiChat));
        map.insert("openai".to_string(), CodecProvider::Builtin(ChatFormat::OpenaiChat));
        map.insert(
            "openai-responses".to_string(),
            CodecProvider::Builtin(ChatFormat::OpenaiResponses),
        );
        map.insert("anthropic".to_string(), CodecProvider::Builtin(ChatFormat::Anthropic));
        map.insert("gemini".to_string(), CodecProvider::Builtin(ChatFormat::Gemini));
        map.insert("moonshot".to_string(), CodecProvider::Builtin(ChatFormat::Moonshot));
        Self {
            entries: RwLock::new(map),
        }
    }

    /// Load all enabled user rules from the conversion_rules table.
    pub async fn load_from_db(&self, db: &SqlitePool) {
        let rows = sqlx::query_as::<_, ConversionRule>(
            "SELECT * FROM conversion_rules WHERE enabled = true",
        )
        .fetch_all(db)
        .await;

        if let Ok(rules) = rows {
            let mut entries = self.entries.write().await;
            for rule in rules {
                let slug = rule.slug.clone();
                entries.insert(slug, CodecProvider::Jsonata(Arc::new(rule)));
            }
        }
    }

    /// Look up a codec provider by slug.
    pub async fn get(&self, slug: &str) -> Option<CodecProvider> {
        let entries = self.entries.read().await;
        entries.get(slug).cloned()
    }

    /// Register a single user rule into the registry.
    pub async fn register_rule(&self, rule: ConversionRule) {
        let slug = rule.slug.clone();
        let mut entries = self.entries.write().await;
        entries.insert(slug, CodecProvider::Jsonata(Arc::new(rule)));
    }

    /// Remove a rule by slug, but only if it is a Jsonata entry (not Builtin).
    pub async fn remove_rule(&self, slug: &str) {
        let mut entries = self.entries.write().await;
        if let Some(CodecProvider::Jsonata(_)) = entries.get(slug) {
            entries.remove(slug);
        }
    }

    /// Clear all Jsonata entries and reload from the database.
    pub async fn reload_from_db(&self, db: &SqlitePool) {
        {
            let mut entries = self.entries.write().await;
            entries.retain(|_, v| matches!(v, CodecProvider::Builtin(_)));
        }
        self.load_from_db(db).await;
    }
}

/// A decoder that uses JSONata expressions from a ConversionRule to transform
/// provider-specific JSON into IR types.
pub struct JsonataDecoder {
    pub rule: Arc<ConversionRule>,
}

impl Decoder for JsonataDecoder {
    fn decode_request(&self, body: &[u8]) -> Result<IrChatRequest, AppError> {
        let input: serde_json::Value =
            serde_json::from_slice(body).map_err(|e| AppError::Codec(format!("Invalid JSON: {e}")))?;
        let result = engine::evaluate(&self.rule.decode_request, &input)?;
        let ir: IrChatRequest = serde_json::from_value(result)
            .map_err(|e| AppError::Codec(format!("Failed to deserialize IrChatRequest: {e}")))?;
        Ok(ir)
    }

    fn decode_response(&self, body: &[u8]) -> Result<IrChatResponse, AppError> {
        let input: serde_json::Value =
            serde_json::from_slice(body).map_err(|e| AppError::Codec(format!("Invalid JSON: {e}")))?;
        let result = engine::evaluate(&self.rule.decode_response, &input)?;
        let ir: IrChatResponse = serde_json::from_value(result)
            .map_err(|e| AppError::Codec(format!("Failed to deserialize IrChatResponse: {e}")))?;
        Ok(ir)
    }

    fn decode_stream_chunk(&self, data: &str) -> Result<Option<IrStreamChunk>, AppError> {
        let expression = self
            .rule
            .decode_stream_chunk
            .as_deref()
            .unwrap_or(&self.rule.decode_response);
        let input: serde_json::Value = serde_json::from_str(data)
            .map_err(|e| AppError::Codec(format!("Invalid JSON in stream chunk: {e}")))?;
        let result = engine::evaluate(expression, &input)?;
        let chunk: IrStreamChunk = serde_json::from_value(result)
            .map_err(|e| AppError::Codec(format!("Failed to deserialize IrStreamChunk: {e}")))?;
        Ok(Some(chunk))
    }

    fn is_stream_done(&self, data: &str) -> bool {
        data.trim() == "[DONE]"
    }
}

/// An encoder that uses JSONata expressions from a ConversionRule to transform
/// IR types into provider-specific JSON.
pub struct JsonataEncoder {
    pub rule: Arc<ConversionRule>,
}

impl Encoder for JsonataEncoder {
    fn encode_request(&self, ir: &IrChatRequest, model: &str) -> Result<Vec<u8>, AppError> {
        let mut input = serde_json::to_value(ir)
            .map_err(|e| AppError::Codec(format!("Failed to serialize IrChatRequest: {e}")))?;
        // Inject the target model name.
        if let serde_json::Value::Object(ref mut map) = input {
            map.insert("model".to_string(), serde_json::Value::String(model.to_string()));
        }
        let result = engine::evaluate(&self.rule.encode_request, &input)?;
        let bytes = serde_json::to_vec(&result)
            .map_err(|e| AppError::Codec(format!("Failed to serialize encoded request: {e}")))?;
        Ok(bytes)
    }

    fn encode_response(&self, ir: &IrChatResponse) -> Result<Vec<u8>, AppError> {
        let input = serde_json::to_value(ir)
            .map_err(|e| AppError::Codec(format!("Failed to serialize IrChatResponse: {e}")))?;
        let result = engine::evaluate(&self.rule.encode_response, &input)?;
        let bytes = serde_json::to_vec(&result)
            .map_err(|e| AppError::Codec(format!("Failed to serialize encoded response: {e}")))?;
        Ok(bytes)
    }

    fn encode_stream_chunk(&self, chunk: &IrStreamChunk) -> Result<Option<String>, AppError> {
        let expression = self
            .rule
            .encode_stream_chunk
            .as_deref()
            .unwrap_or(&self.rule.encode_response);
        let input = serde_json::to_value(chunk)
            .map_err(|e| AppError::Codec(format!("Failed to serialize IrStreamChunk: {e}")))?;
        let result = engine::evaluate(expression, &input)?;
        let s = serde_json::to_string(&result)
            .map_err(|e| AppError::Codec(format!("Failed to serialize encoded stream chunk: {e}")))?;
        Ok(Some(s))
    }

    fn stream_done_signal(&self) -> Option<String> {
        Some("[DONE]".to_string())
    }
}
