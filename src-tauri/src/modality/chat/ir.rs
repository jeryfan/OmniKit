use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// IR Chat Request — the universal intermediate representation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IrChatRequest {
    pub model: String,
    pub messages: Vec<IrMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<IrTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<IrToolChoice>,
    /// Provider-specific fields that don't map to IR fields.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IrMessage {
    pub role: IrRole,
    pub content: IrContent,
    /// For assistant messages with tool calls.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<IrToolCall>>,
    /// For tool result messages.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    /// Tool name (used by Gemini function responses).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum IrRole {
    System,
    User,
    Assistant,
    Tool,
}

/// Content can be a simple string or a list of content parts (multimodal).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum IrContent {
    Text(String),
    Parts(Vec<IrContentPart>),
}

impl IrContent {
    /// Extract plain text from content, joining all text parts.
    pub fn to_text(&self) -> String {
        match self {
            IrContent::Text(s) => s.clone(),
            IrContent::Parts(parts) => parts
                .iter()
                .filter_map(|p| match p {
                    IrContentPart::Text { text } => Some(text.as_str()),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join(""),
        }
    }

    /// Check if content is empty or null-like.
    pub fn is_empty(&self) -> bool {
        match self {
            IrContent::Text(s) => s.is_empty(),
            IrContent::Parts(parts) => parts.is_empty(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum IrContentPart {
    Text {
        text: String,
    },
    Image {
        #[serde(skip_serializing_if = "Option::is_none")]
        url: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        media_type: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        data: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IrTool {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IrToolChoice {
    Auto,
    None,
    Any,
    Tool { name: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IrToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

// --- Response IR ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IrChatResponse {
    pub id: String,
    pub model: String,
    pub message: IrMessage,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<IrFinishReason>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<IrUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum IrFinishReason {
    Stop,
    Length,
    ToolCalls,
    ContentFilter,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct IrUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_tokens: Option<u32>,
}

// --- Streaming IR ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IrStreamChunk {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delta_role: Option<IrRole>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delta_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delta_tool_calls: Option<Vec<IrToolCallDelta>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<IrFinishReason>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<IrUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IrToolCallDelta {
    pub index: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments: Option<String>,
}
