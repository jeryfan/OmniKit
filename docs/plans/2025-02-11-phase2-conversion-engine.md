# Phase 2: Core Conversion Engine — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the chat modality conversion engine with 5 codecs (OpenAI Chat, OpenAI Responses, Anthropic, Gemini, Moonshot), streaming SSE pipeline, channel routing with load balancing and circuit breaking, and authentication middleware.

**Architecture:** Each codec implements Decoder + Encoder traits against a shared Chat IR (intermediate representation). The proxy handler decodes incoming requests to IR, routes to an upstream channel, encodes IR to the upstream format, streams the response back through reverse decoding/encoding. Channel selection uses priority-based weighted random with circuit breaking.

**Tech Stack:** Rust, Axum, Tokio, reqwest (streaming), serde, thiserror, rand (for weighted random)

**Pre-requisites:** Phase 1 complete — Tauri app with Axum server on port 9000, SQLite with 5 tables, React frontend with sidebar layout.

**Reference:** Each codec strictly follows its provider's official API documentation. No custom format modifications.

---

### Task 1: Modality traits + Chat IR + Error types

**Files:**
- Create: `src-tauri/src/modality/mod.rs`
- Create: `src-tauri/src/modality/chat/mod.rs`
- Create: `src-tauri/src/modality/chat/ir.rs`
- Create: `src-tauri/src/error.rs`
- Modify: `src-tauri/src/lib.rs` (add modality + error modules)

**Step 1: Create src-tauri/src/error.rs**

```rust
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json, Response};
use serde_json::json;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Invalid request: {0}")]
    BadRequest(String),

    #[error("Authentication failed: {0}")]
    Unauthorized(String),

    #[error("Channel not found for model: {0}")]
    NoChannel(String),

    #[error("All channels failed for model: {0}")]
    AllChannelsFailed(String),

    #[error("Upstream error: {status} {body}")]
    Upstream { status: u16, body: String },

    #[error("Codec error: {0}")]
    Codec(String),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("HTTP client error: {0}")]
    HttpClient(#[from] reqwest::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::BadRequest(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            AppError::Unauthorized(_) => (StatusCode::UNAUTHORIZED, self.to_string()),
            AppError::NoChannel(_) => (StatusCode::NOT_FOUND, self.to_string()),
            AppError::AllChannelsFailed(_) => (StatusCode::BAD_GATEWAY, self.to_string()),
            AppError::Upstream { status, .. } => (
                StatusCode::from_u16(*status).unwrap_or(StatusCode::BAD_GATEWAY),
                self.to_string(),
            ),
            AppError::Codec(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            AppError::Database(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Database error".into()),
            AppError::HttpClient(_) => (StatusCode::BAD_GATEWAY, self.to_string()),
            AppError::Json(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            AppError::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
        };

        let body = Json(json!({
            "error": {
                "message": message,
                "type": format!("{:?}", status),
            }
        }));

        (status, body).into_response()
    }
}
```

**Step 2: Create src-tauri/src/modality/mod.rs**

```rust
pub mod chat;
```

**Step 3: Create src-tauri/src/modality/chat/mod.rs**

```rust
pub mod ir;
pub mod openai_chat;
// pub mod openai_responses;  // Task 8
// pub mod anthropic;          // Task 5
// pub mod gemini;             // Task 6
// pub mod moonshot;           // Task 7

use crate::error::AppError;
use ir::{IrChatRequest, IrChatResponse, IrStreamChunk};

/// Identifies the wire format of a request/response.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ChatFormat {
    OpenaiChat,
    OpenaiResponses,
    Anthropic,
    Gemini,
    Moonshot,
}

impl ChatFormat {
    /// Parse from string (header value, query param, or provider name).
    pub fn from_str_loose(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "openai-chat" | "openai_chat" | "openai" => Some(Self::OpenaiChat),
            "openai-responses" | "openai_responses" => Some(Self::OpenaiResponses),
            "anthropic" | "claude" => Some(Self::Anthropic),
            "gemini" | "google" => Some(Self::Gemini),
            "moonshot" | "kimi" => Some(Self::Moonshot),
            _ => None,
        }
    }

    /// Map from provider name stored in database channel.
    pub fn from_provider(provider: &str) -> Option<Self> {
        match provider {
            "openai" => Some(Self::OpenaiChat),
            "anthropic" => Some(Self::Anthropic),
            "gemini" => Some(Self::Gemini),
            "moonshot" => Some(Self::Moonshot),
            _ => None,
        }
    }
}

/// Decodes a provider-specific format into IR.
pub trait Decoder: Send + Sync {
    /// Decode an incoming HTTP request body into IR.
    fn decode_request(&self, body: &[u8]) -> Result<IrChatRequest, AppError>;

    /// Decode a non-streaming upstream response body into IR.
    fn decode_response(&self, body: &[u8]) -> Result<IrChatResponse, AppError>;

    /// Decode a single SSE data line from upstream into an IR stream chunk.
    /// Returns None if the line is a keep-alive, comment, or terminal signal.
    fn decode_stream_chunk(&self, data: &str) -> Result<Option<IrStreamChunk>, AppError>;

    /// Returns true if the given SSE data line signals end-of-stream.
    fn is_stream_done(&self, data: &str) -> bool;
}

/// Encodes IR into a provider-specific format.
pub trait Encoder: Send + Sync {
    /// Encode IR request into bytes to send upstream.
    fn encode_request(&self, ir: &IrChatRequest, model: &str) -> Result<Vec<u8>, AppError>;

    /// Encode IR response into bytes to send downstream.
    fn encode_response(&self, ir: &IrChatResponse) -> Result<Vec<u8>, AppError>;

    /// Encode an IR stream chunk into an SSE data line to send downstream.
    fn encode_stream_chunk(&self, chunk: &IrStreamChunk) -> Result<Option<String>, AppError>;

    /// Return the SSE termination signal for this format (e.g. "[DONE]").
    fn stream_done_signal(&self) -> Option<String>;
}

/// Get a decoder for a given format.
pub fn get_decoder(format: ChatFormat) -> Box<dyn Decoder> {
    match format {
        ChatFormat::OpenaiChat => Box::new(openai_chat::OpenAiChatCodec),
        ChatFormat::Moonshot => Box::new(openai_chat::OpenAiChatCodec), // Moonshot is OpenAI-compatible
        // Other formats will be added in subsequent tasks
        _ => unimplemented!("Decoder for {:?} not yet implemented", format),
    }
}

/// Get an encoder for a given format.
pub fn get_encoder(format: ChatFormat) -> Box<dyn Encoder> {
    match format {
        ChatFormat::OpenaiChat => Box::new(openai_chat::OpenAiChatCodec),
        ChatFormat::Moonshot => Box::new(openai_chat::OpenAiChatCodec),
        _ => unimplemented!("Encoder for {:?} not yet implemented", format),
    }
}
```

**Step 4: Create src-tauri/src/modality/chat/ir.rs**

This is the core intermediate representation. It must capture the superset of all provider fields.

```rust
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
```

**Step 5: Update src-tauri/src/lib.rs**

Add at the top of the file:
```rust
mod error;
mod modality;
```

**Step 6: Verify compilation**

```bash
cd src-tauri && cargo check
```

Expected: compiles with warnings about unused code (expected at this stage).

**Step 7: Commit**

```bash
git add src-tauri/src/error.rs src-tauri/src/modality/
git commit -m "feat(core): add modality traits, chat IR, and error types"
```

---

### Task 2: OpenAI Chat Completions codec

**Files:**
- Create: `src-tauri/src/modality/chat/openai_chat.rs`

**Context:** This is the first codec. OpenAI Chat Completions is the most widely used format. Moonshot uses the same format, so this codec serves both.

**API Reference:**
- Endpoint: `POST /v1/chat/completions`
- Auth: `Authorization: Bearer <key>`
- Streaming: SSE with `data: {...}` lines, terminated by `data: [DONE]`

**Step 1: Create src-tauri/src/modality/chat/openai_chat.rs**

```rust
use super::ir::*;
use super::{Decoder, Encoder};
use crate::error::AppError;
use serde::{Deserialize, Serialize};

pub struct OpenAiChatCodec;

// --- OpenAI Wire Types ---

#[derive(Debug, Serialize, Deserialize)]
pub struct OaiRequest {
    pub model: String,
    pub messages: Vec<OaiMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<OaiTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream_options: Option<OaiStreamOptions>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OaiStreamOptions {
    pub include_usage: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OaiMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<OaiToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OaiToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: OaiFunction,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OaiFunction {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OaiTool {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: OaiToolFunction,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OaiToolFunction {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<serde_json::Value>,
}

// --- Response types ---

#[derive(Debug, Serialize, Deserialize)]
pub struct OaiResponse {
    pub id: String,
    pub object: String,
    pub model: String,
    pub choices: Vec<OaiChoice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<OaiUsage>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OaiChoice {
    pub index: u32,
    pub message: OaiMessage,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OaiUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

// --- Streaming types ---

#[derive(Debug, Serialize, Deserialize)]
pub struct OaiStreamChunk {
    pub id: String,
    pub object: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    pub choices: Vec<OaiStreamChoice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<OaiUsage>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OaiStreamChoice {
    pub index: u32,
    pub delta: OaiStreamDelta,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OaiStreamDelta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<OaiStreamToolCall>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OaiStreamToolCall {
    pub index: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub call_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function: Option<OaiStreamFunction>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OaiStreamFunction {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments: Option<String>,
}

// --- Conversion helpers ---

fn oai_role_to_ir(role: &str) -> IrRole {
    match role {
        "system" => IrRole::System,
        "assistant" => IrRole::Assistant,
        "tool" => IrRole::Tool,
        _ => IrRole::User,
    }
}

fn ir_role_to_oai(role: &IrRole) -> &'static str {
    match role {
        IrRole::System => "system",
        IrRole::User => "user",
        IrRole::Assistant => "assistant",
        IrRole::Tool => "tool",
    }
}

fn oai_content_to_ir(content: &Option<serde_json::Value>) -> IrContent {
    match content {
        None => IrContent::Text(String::new()),
        Some(serde_json::Value::String(s)) => IrContent::Text(s.clone()),
        Some(serde_json::Value::Array(parts)) => {
            let ir_parts: Vec<IrContentPart> = parts
                .iter()
                .filter_map(|p| {
                    let t = p.get("type")?.as_str()?;
                    match t {
                        "text" => Some(IrContentPart::Text {
                            text: p.get("text")?.as_str()?.to_string(),
                        }),
                        "image_url" => {
                            let url = p.get("image_url")?.get("url")?.as_str()?.to_string();
                            Some(IrContentPart::Image {
                                url: Some(url),
                                media_type: None,
                                data: None,
                            })
                        }
                        _ => None,
                    }
                })
                .collect();
            IrContent::Parts(ir_parts)
        }
        Some(serde_json::Value::Null) => IrContent::Text(String::new()),
        _ => IrContent::Text(String::new()),
    }
}

fn ir_content_to_oai(content: &IrContent) -> serde_json::Value {
    match content {
        IrContent::Text(s) => serde_json::Value::String(s.clone()),
        IrContent::Parts(parts) => {
            let oai_parts: Vec<serde_json::Value> = parts
                .iter()
                .map(|p| match p {
                    IrContentPart::Text { text } => serde_json::json!({
                        "type": "text",
                        "text": text,
                    }),
                    IrContentPart::Image { url, .. } => serde_json::json!({
                        "type": "image_url",
                        "image_url": { "url": url },
                    }),
                })
                .collect();
            serde_json::Value::Array(oai_parts)
        }
    }
}

fn oai_finish_to_ir(reason: &Option<String>) -> Option<IrFinishReason> {
    reason.as_ref().map(|r| match r.as_str() {
        "stop" => IrFinishReason::Stop,
        "length" => IrFinishReason::Length,
        "tool_calls" => IrFinishReason::ToolCalls,
        "content_filter" => IrFinishReason::ContentFilter,
        _ => IrFinishReason::Stop,
    })
}

fn ir_finish_to_oai(reason: &Option<IrFinishReason>) -> Option<String> {
    reason.as_ref().map(|r| match r {
        IrFinishReason::Stop => "stop".to_string(),
        IrFinishReason::Length => "length".to_string(),
        IrFinishReason::ToolCalls => "tool_calls".to_string(),
        IrFinishReason::ContentFilter => "content_filter".to_string(),
    })
}

// --- Decoder impl ---

impl Decoder for OpenAiChatCodec {
    fn decode_request(&self, body: &[u8]) -> Result<IrChatRequest, AppError> {
        let req: OaiRequest =
            serde_json::from_slice(body).map_err(|e| AppError::Codec(e.to_string()))?;

        // Extract system message from messages list
        let mut system = None;
        let mut messages = Vec::new();

        for msg in &req.messages {
            if msg.role == "system" {
                system = Some(oai_content_to_ir(&msg.content).to_text());
            } else {
                let mut ir_msg = IrMessage {
                    role: oai_role_to_ir(&msg.role),
                    content: oai_content_to_ir(&msg.content),
                    tool_calls: None,
                    tool_call_id: msg.tool_call_id.clone(),
                    name: msg.name.clone(),
                };

                if let Some(tcs) = &msg.tool_calls {
                    ir_msg.tool_calls = Some(
                        tcs.iter()
                            .map(|tc| IrToolCall {
                                id: tc.id.clone(),
                                name: tc.function.name.clone(),
                                arguments: tc.function.arguments.clone(),
                            })
                            .collect(),
                    );
                }

                messages.push(ir_msg);
            }
        }

        let tools = req.tools.map(|ts| {
            ts.into_iter()
                .map(|t| IrTool {
                    name: t.function.name,
                    description: t.function.description,
                    parameters: t.function.parameters.unwrap_or(serde_json::json!({})),
                })
                .collect()
        });

        let tool_choice = req.tool_choice.and_then(|tc| {
            if tc.is_string() {
                match tc.as_str()? {
                    "auto" => Some(IrToolChoice::Auto),
                    "none" => Some(IrToolChoice::None),
                    "required" => Some(IrToolChoice::Any),
                    _ => None,
                }
            } else {
                let name = tc.get("function")?.get("name")?.as_str()?.to_string();
                Some(IrToolChoice::Tool { name })
            }
        });

        Ok(IrChatRequest {
            model: req.model,
            messages,
            system,
            temperature: req.temperature,
            top_p: req.top_p,
            max_tokens: req.max_tokens,
            stream: req.stream.unwrap_or(false),
            stop: req.stop.and_then(|s| {
                if s.is_string() {
                    Some(vec![s.as_str().unwrap().to_string()])
                } else if s.is_array() {
                    Some(
                        s.as_array()
                            .unwrap()
                            .iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect(),
                    )
                } else {
                    None
                }
            }),
            tools,
            tool_choice,
            extra: None,
        })
    }

    fn decode_response(&self, body: &[u8]) -> Result<IrChatResponse, AppError> {
        let resp: OaiResponse =
            serde_json::from_slice(body).map_err(|e| AppError::Codec(e.to_string()))?;

        let choice = resp.choices.into_iter().next().ok_or_else(|| {
            AppError::Codec("No choices in response".to_string())
        })?;

        let mut ir_msg = IrMessage {
            role: oai_role_to_ir(&choice.message.role),
            content: oai_content_to_ir(&choice.message.content),
            tool_calls: None,
            tool_call_id: None,
            name: None,
        };

        if let Some(tcs) = &choice.message.tool_calls {
            ir_msg.tool_calls = Some(
                tcs.iter()
                    .map(|tc| IrToolCall {
                        id: tc.id.clone(),
                        name: tc.function.name.clone(),
                        arguments: tc.function.arguments.clone(),
                    })
                    .collect(),
            );
        }

        Ok(IrChatResponse {
            id: resp.id,
            model: resp.model,
            message: ir_msg,
            finish_reason: oai_finish_to_ir(&choice.finish_reason),
            usage: resp.usage.map(|u| IrUsage {
                prompt_tokens: u.prompt_tokens,
                completion_tokens: u.completion_tokens,
                total_tokens: Some(u.total_tokens),
            }),
        })
    }

    fn decode_stream_chunk(&self, data: &str) -> Result<Option<IrStreamChunk>, AppError> {
        if data.trim().is_empty() || self.is_stream_done(data) {
            return Ok(None);
        }

        let chunk: OaiStreamChunk =
            serde_json::from_str(data).map_err(|e| AppError::Codec(e.to_string()))?;

        let choice = match chunk.choices.first() {
            Some(c) => c,
            None => {
                // Usage-only chunk (final chunk with stream_options.include_usage)
                if let Some(usage) = &chunk.usage {
                    return Ok(Some(IrStreamChunk {
                        id: chunk.id,
                        model: chunk.model,
                        delta_role: None,
                        delta_content: None,
                        delta_tool_calls: None,
                        finish_reason: None,
                        usage: Some(IrUsage {
                            prompt_tokens: usage.prompt_tokens,
                            completion_tokens: usage.completion_tokens,
                            total_tokens: Some(usage.total_tokens),
                        }),
                    }));
                }
                return Ok(None);
            }
        };

        let delta_tool_calls = choice.delta.tool_calls.as_ref().map(|tcs| {
            tcs.iter()
                .map(|tc| IrToolCallDelta {
                    index: tc.index,
                    id: tc.id.clone(),
                    name: tc.function.as_ref().and_then(|f| f.name.clone()),
                    arguments: tc.function.as_ref().and_then(|f| f.arguments.clone()),
                })
                .collect()
        });

        Ok(Some(IrStreamChunk {
            id: chunk.id,
            model: chunk.model,
            delta_role: choice.delta.role.as_ref().map(|r| oai_role_to_ir(r)),
            delta_content: choice.delta.content.clone(),
            delta_tool_calls,
            finish_reason: oai_finish_to_ir(&choice.finish_reason),
            usage: chunk.usage.map(|u| IrUsage {
                prompt_tokens: u.prompt_tokens,
                completion_tokens: u.completion_tokens,
                total_tokens: Some(u.total_tokens),
            }),
        }))
    }

    fn is_stream_done(&self, data: &str) -> bool {
        data.trim() == "[DONE]"
    }
}

// --- Encoder impl ---

impl Encoder for OpenAiChatCodec {
    fn encode_request(&self, ir: &IrChatRequest, model: &str) -> Result<Vec<u8>, AppError> {
        let mut messages = Vec::new();

        // Add system message first if present
        if let Some(sys) = &ir.system {
            messages.push(OaiMessage {
                role: "system".to_string(),
                content: Some(serde_json::Value::String(sys.clone())),
                tool_calls: None,
                tool_call_id: None,
                name: None,
            });
        }

        for msg in &ir.messages {
            let mut oai_msg = OaiMessage {
                role: ir_role_to_oai(&msg.role).to_string(),
                content: Some(ir_content_to_oai(&msg.content)),
                tool_calls: None,
                tool_call_id: msg.tool_call_id.clone(),
                name: msg.name.clone(),
            };

            if let Some(tcs) = &msg.tool_calls {
                oai_msg.content = None;
                oai_msg.tool_calls = Some(
                    tcs.iter()
                        .map(|tc| OaiToolCall {
                            id: tc.id.clone(),
                            call_type: "function".to_string(),
                            function: OaiFunction {
                                name: tc.name.clone(),
                                arguments: tc.arguments.clone(),
                            },
                        })
                        .collect(),
                );
            }

            messages.push(oai_msg);
        }

        let tools = ir.tools.as_ref().map(|ts| {
            ts.iter()
                .map(|t| OaiTool {
                    tool_type: "function".to_string(),
                    function: OaiToolFunction {
                        name: t.name.clone(),
                        description: t.description.clone(),
                        parameters: Some(t.parameters.clone()),
                    },
                })
                .collect()
        });

        let tool_choice = ir.tool_choice.as_ref().map(|tc| match tc {
            IrToolChoice::Auto => serde_json::json!("auto"),
            IrToolChoice::None => serde_json::json!("none"),
            IrToolChoice::Any => serde_json::json!("required"),
            IrToolChoice::Tool { name } => serde_json::json!({
                "type": "function",
                "function": { "name": name }
            }),
        });

        let req = OaiRequest {
            model: model.to_string(),
            messages,
            temperature: ir.temperature,
            top_p: ir.top_p,
            max_tokens: ir.max_tokens,
            stream: if ir.stream { Some(true) } else { None },
            stop: ir.stop.as_ref().map(|s| serde_json::json!(s)),
            tools,
            tool_choice,
            stream_options: if ir.stream {
                Some(OaiStreamOptions { include_usage: true })
            } else {
                None
            },
        };

        serde_json::to_vec(&req).map_err(|e| AppError::Codec(e.to_string()))
    }

    fn encode_response(&self, ir: &IrChatResponse) -> Result<Vec<u8>, AppError> {
        let mut oai_msg = OaiMessage {
            role: ir_role_to_oai(&ir.message.role).to_string(),
            content: Some(ir_content_to_oai(&ir.message.content)),
            tool_calls: None,
            tool_call_id: None,
            name: None,
        };

        if let Some(tcs) = &ir.message.tool_calls {
            oai_msg.tool_calls = Some(
                tcs.iter()
                    .map(|tc| OaiToolCall {
                        id: tc.id.clone(),
                        call_type: "function".to_string(),
                        function: OaiFunction {
                            name: tc.name.clone(),
                            arguments: tc.arguments.clone(),
                        },
                    })
                    .collect(),
            );
        }

        let usage = ir.usage.as_ref().map(|u| OaiUsage {
            prompt_tokens: u.prompt_tokens,
            completion_tokens: u.completion_tokens,
            total_tokens: u.total_tokens.unwrap_or(u.prompt_tokens + u.completion_tokens),
        });

        let resp = OaiResponse {
            id: ir.id.clone(),
            object: "chat.completion".to_string(),
            model: ir.model.clone(),
            choices: vec![OaiChoice {
                index: 0,
                message: oai_msg,
                finish_reason: ir_finish_to_oai(&ir.finish_reason),
            }],
            usage,
        };

        serde_json::to_vec(&resp).map_err(|e| AppError::Codec(e.to_string()))
    }

    fn encode_stream_chunk(&self, chunk: &IrStreamChunk) -> Result<Option<String>, AppError> {
        let delta_tool_calls = chunk.delta_tool_calls.as_ref().map(|tcs| {
            tcs.iter()
                .map(|tc| OaiStreamToolCall {
                    index: tc.index,
                    id: tc.id.clone(),
                    call_type: tc.id.as_ref().map(|_| "function".to_string()),
                    function: if tc.name.is_some() || tc.arguments.is_some() {
                        Some(OaiStreamFunction {
                            name: tc.name.clone(),
                            arguments: tc.arguments.clone(),
                        })
                    } else {
                        None
                    },
                })
                .collect()
        });

        let oai_chunk = OaiStreamChunk {
            id: chunk.id.clone(),
            object: "chat.completion.chunk".to_string(),
            model: chunk.model.clone(),
            choices: vec![OaiStreamChoice {
                index: 0,
                delta: OaiStreamDelta {
                    role: chunk.delta_role.as_ref().map(|r| ir_role_to_oai(r).to_string()),
                    content: chunk.delta_content.clone(),
                    tool_calls: delta_tool_calls,
                },
                finish_reason: ir_finish_to_oai(&chunk.finish_reason),
            }],
            usage: chunk.usage.as_ref().map(|u| OaiUsage {
                prompt_tokens: u.prompt_tokens,
                completion_tokens: u.completion_tokens,
                total_tokens: u.total_tokens.unwrap_or(u.prompt_tokens + u.completion_tokens),
            }),
        };

        let json = serde_json::to_string(&oai_chunk)
            .map_err(|e| AppError::Codec(e.to_string()))?;

        Ok(Some(json))
    }

    fn stream_done_signal(&self) -> Option<String> {
        Some("[DONE]".to_string())
    }
}
```

**Step 2: Uncomment openai_chat in chat/mod.rs**

The module is already declared. Just ensure it's uncommented.

**Step 3: Verify compilation**

```bash
cd src-tauri && cargo check
```

**Step 4: Commit**

```bash
git add src-tauri/src/modality/chat/openai_chat.rs
git commit -m "feat(codec): implement OpenAI Chat Completions decoder and encoder"
```

---

### Task 3: Proxy handler — non-streaming flow

**Files:**
- Create: `src-tauri/src/server/proxy.rs`
- Create: `src-tauri/src/server/middleware.rs`
- Modify: `src-tauri/src/server/router.rs` (add proxy routes)
- Modify: `src-tauri/src/server/mod.rs` (add proxy + middleware modules)
- Modify: `src-tauri/Cargo.toml` (add rand)

**Context:** This implements the core proxy flow for non-streaming requests. The proxy handler:
1. Authenticates the request via Bearer token
2. Detects input format from the route path
3. Decodes request body → IR
4. Looks up a channel for the model (basic DB lookup, no load balancing yet)
5. Encodes IR → upstream format
6. Sends to upstream provider
7. Decodes upstream response → IR
8. Encodes IR → target output format
9. Returns to client

**Step 1: Add rand to Cargo.toml**

Add to `[dependencies]`:
```toml
rand = "0.9"
```

**Step 2: Create src-tauri/src/server/middleware.rs**

```rust
use crate::error::AppError;
use axum::http::HeaderMap;

/// Extract and validate the Bearer token from request headers.
/// Returns the raw token string (without "Bearer " prefix).
pub fn extract_bearer_token(headers: &HeaderMap) -> Result<String, AppError> {
    let auth = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("Missing Authorization header".into()))?;

    if !auth.starts_with("Bearer ") {
        return Err(AppError::Unauthorized("Invalid Authorization format".into()));
    }

    Ok(auth[7..].to_string())
}

/// Determine desired output format from headers or query params.
/// Returns None if not specified (meaning: same as input format).
pub fn extract_output_format(headers: &HeaderMap, query: Option<&str>) -> Option<String> {
    // Priority 1: X-Output-Format header
    if let Some(v) = headers.get("x-output-format").and_then(|v| v.to_str().ok()) {
        return Some(v.to_string());
    }

    // Priority 2: output_format query param
    if let Some(q) = query {
        for pair in q.split('&') {
            if let Some(val) = pair.strip_prefix("output_format=") {
                return Some(val.to_string());
            }
        }
    }

    None
}
```

**Step 3: Create src-tauri/src/server/proxy.rs**

```rust
use crate::error::AppError;
use crate::modality::chat::{self, ChatFormat, Decoder, Encoder};
use crate::server::middleware;
use axum::body::Body;
use axum::extract::{Query, State};
use axum::http::{HeaderMap, HeaderValue, Request, StatusCode};
use axum::response::{IntoResponse, Response};
use bytes::Bytes;
use futures_core::Stream;
use reqwest::Client;
use serde::Deserialize;
use sqlx::SqlitePool;
use std::pin::Pin;
use tokio_stream::StreamExt;

#[derive(Debug, Clone)]
pub struct ProxyState {
    pub db: SqlitePool,
    pub http_client: Client,
}

/// Main proxy handler for chat completion requests.
/// The `input_format` is determined from the route path.
pub async fn proxy_chat(
    State(state): State<ProxyState>,
    headers: HeaderMap,
    input_format: ChatFormat,
    body: Bytes,
) -> Result<Response, AppError> {
    // 1. Authenticate
    let token_value = middleware::extract_bearer_token(&headers)?;
    let token = sqlx::query_as::<_, crate::db::models::Token>(
        "SELECT * FROM tokens WHERE key_value = ? AND enabled = 1",
    )
    .bind(&token_value)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Unauthorized("Invalid API key".into()))?;

    // Check token expiry
    if let Some(expires) = &token.expires_at {
        let now = chrono::Utc::now().naive_utc().to_string();
        if *expires < now {
            return Err(AppError::Unauthorized("API key expired".into()));
        }
    }

    // 2. Decode request
    let decoder = chat::get_decoder(input_format);
    let ir = decoder.decode_request(&body)?;

    // 3. Determine output format
    let output_format_str = middleware::extract_output_format(&headers, None);
    let output_format = output_format_str
        .as_ref()
        .and_then(|s| ChatFormat::from_str_loose(s))
        .unwrap_or(input_format);

    // 4. Find a channel for this model
    let model_name = &ir.model;
    let mapping = sqlx::query_as::<_, crate::db::models::ModelMapping>(
        "SELECT m.* FROM model_mappings m
         JOIN channels c ON m.channel_id = c.id
         WHERE m.public_name = ? AND c.enabled = 1
         ORDER BY c.priority ASC, RANDOM()
         LIMIT 1",
    )
    .bind(model_name)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NoChannel(model_name.clone()))?;

    let channel = sqlx::query_as::<_, crate::db::models::Channel>(
        "SELECT * FROM channels WHERE id = ?",
    )
    .bind(&mapping.channel_id)
    .fetch_one(&state.db)
    .await?;

    let api_key = sqlx::query_scalar::<_, String>(
        "SELECT key_value FROM channel_api_keys WHERE channel_id = ? AND enabled = 1 LIMIT 1",
    )
    .bind(&channel.id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Internal("No API key configured for channel".into()))?;

    // 5. Determine upstream format from channel provider
    let upstream_format = ChatFormat::from_provider(&channel.provider)
        .ok_or_else(|| AppError::Internal(format!("Unknown provider: {}", channel.provider)))?;

    // 6. Encode IR → upstream format
    let upstream_encoder = chat::get_encoder(upstream_format);
    let upstream_body = upstream_encoder.encode_request(&ir, &mapping.actual_name)?;

    // 7. Build upstream URL
    let upstream_url = build_upstream_url(&channel.base_url, upstream_format, &mapping.actual_name);

    // 8. Build upstream request with provider-specific auth
    let mut req_builder = state
        .http_client
        .post(&upstream_url)
        .header("Content-Type", "application/json")
        .body(upstream_body);

    req_builder = apply_auth(req_builder, upstream_format, &api_key);

    // 9. Send request
    let upstream_resp = req_builder.send().await?;
    let status = upstream_resp.status();

    if !status.is_success() {
        let error_body = upstream_resp.text().await.unwrap_or_default();
        return Err(AppError::Upstream {
            status: status.as_u16(),
            body: error_body,
        });
    }

    // 10. Handle streaming vs non-streaming
    if ir.stream {
        return proxy_stream(
            upstream_resp,
            upstream_format,
            output_format,
        )
        .await;
    }

    // Non-streaming: decode upstream response → IR → encode to output format
    let resp_bytes = upstream_resp.bytes().await?;
    let upstream_decoder = chat::get_decoder(upstream_format);
    let ir_response = upstream_decoder.decode_response(&resp_bytes)?;

    let output_encoder = chat::get_encoder(output_format);
    let output_bytes = output_encoder.encode_response(&ir_response)?;

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .body(Body::from(output_bytes))
        .unwrap())
}

/// Handle streaming proxy: pipe upstream SSE → decode → re-encode → downstream SSE.
async fn proxy_stream(
    upstream_resp: reqwest::Response,
    upstream_format: ChatFormat,
    output_format: ChatFormat,
) -> Result<Response, AppError> {
    let upstream_decoder = chat::get_decoder(upstream_format);
    let output_encoder = chat::get_encoder(output_format);

    let byte_stream = upstream_resp.bytes_stream();

    let sse_stream = async_stream::stream! {
        let mut buffer = String::new();
        let mut byte_stream = Box::pin(byte_stream);

        while let Some(chunk_result) = byte_stream.next().await {
            let chunk = match chunk_result {
                Ok(c) => c,
                Err(e) => {
                    log::error!("Upstream stream error: {}", e);
                    break;
                }
            };

            buffer.push_str(&String::from_utf8_lossy(&chunk));

            // Process complete SSE lines
            while let Some(pos) = buffer.find("\n\n") {
                let event_block = buffer[..pos].to_string();
                buffer = buffer[pos + 2..].to_string();

                for line in event_block.lines() {
                    let data = if let Some(d) = line.strip_prefix("data: ") {
                        d.trim()
                    } else if let Some(d) = line.strip_prefix("data:") {
                        d.trim()
                    } else {
                        continue;
                    };

                    if upstream_decoder.is_stream_done(data) {
                        // Send output format's done signal
                        if let Some(done) = output_encoder.stream_done_signal() {
                            yield Ok::<_, std::convert::Infallible>(
                                format!("data: {}\n\n", done)
                            );
                        }
                        break;
                    }

                    match upstream_decoder.decode_stream_chunk(data) {
                        Ok(Some(ir_chunk)) => {
                            match output_encoder.encode_stream_chunk(&ir_chunk) {
                                Ok(Some(encoded)) => {
                                    yield Ok(format!("data: {}\n\n", encoded));
                                }
                                Ok(None) => {}
                                Err(e) => {
                                    log::error!("Encode stream chunk error: {}", e);
                                }
                            }
                        }
                        Ok(None) => {}
                        Err(e) => {
                            log::error!("Decode stream chunk error: {}", e);
                        }
                    }
                }
            }
        }
    };

    let body = Body::from_stream(sse_stream);

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .body(body)
        .unwrap())
}

fn build_upstream_url(base_url: &str, format: ChatFormat, model: &str) -> String {
    let base = base_url.trim_end_matches('/');
    match format {
        ChatFormat::OpenaiChat | ChatFormat::Moonshot => {
            format!("{}/v1/chat/completions", base)
        }
        ChatFormat::OpenaiResponses => {
            format!("{}/v1/responses", base)
        }
        ChatFormat::Anthropic => {
            format!("{}/v1/messages", base)
        }
        ChatFormat::Gemini => {
            format!(
                "{}/v1beta/models/{}:streamGenerateContent?alt=sse",
                base, model
            )
        }
    }
}

fn apply_auth(
    builder: reqwest::RequestBuilder,
    format: ChatFormat,
    api_key: &str,
) -> reqwest::RequestBuilder {
    match format {
        ChatFormat::OpenaiChat | ChatFormat::OpenaiResponses | ChatFormat::Moonshot => {
            builder.header("Authorization", format!("Bearer {}", api_key))
        }
        ChatFormat::Anthropic => builder
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01"),
        ChatFormat::Gemini => {
            builder.header("x-goog-api-key", api_key)
        }
    }
}
```

**Step 4: Update src-tauri/src/server/router.rs**

```rust
use super::proxy::{self, ProxyState};
use crate::modality::chat::ChatFormat;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::{Json, Response};
use axum::routing::{get, post};
use axum::Router;
use serde_json::{json, Value};
use sqlx::SqlitePool;
use tower_http::cors::CorsLayer;

pub fn create_router(pool: SqlitePool) -> Router {
    let http_client = reqwest::Client::new();
    let proxy_state = ProxyState {
        db: pool.clone(),
        http_client,
    };

    Router::new()
        .route("/health", get(health_check))
        // OpenAI Chat Completions compatible endpoint
        .route(
            "/v1/chat/completions",
            post(handle_openai_chat),
        )
        .layer(CorsLayer::permissive())
        .with_state(proxy_state)
}

async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

async fn handle_openai_chat(
    state: State<ProxyState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, crate::error::AppError> {
    proxy::proxy_chat(state, headers, ChatFormat::OpenaiChat, body).await
}
```

**Step 5: Update src-tauri/src/server/mod.rs**

```rust
pub mod middleware;
pub mod proxy;
pub mod router;

use proxy::ProxyState;
use sqlx::SqlitePool;
use std::net::SocketAddr;

pub async fn start(
    pool: SqlitePool,
    port: u16,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let app = router::create_router(pool);
    let addr = SocketAddr::from(([127, 0, 0, 1], port));

    let listener = tokio::net::TcpListener::bind(addr).await?;
    log::info!("Axum server listening on {}", addr);

    axum::serve(listener, app).await?;
    Ok(())
}
```

**Step 6: Add required crates to Cargo.toml**

Add to `[dependencies]`:
```toml
async-stream = "0.3"
futures-core = "0.3"
tokio-stream = "0.1"
bytes = "1"
rand = "0.9"
```

**Step 7: Verify compilation**

```bash
cd src-tauri && cargo check
```

**Step 8: Commit**

```bash
git add src-tauri/
git commit -m "feat(proxy): implement proxy handler with SSE streaming pipeline"
```

---

### Task 4: Anthropic Messages codec

**Files:**
- Create: `src-tauri/src/modality/chat/anthropic.rs`
- Modify: `src-tauri/src/modality/chat/mod.rs` (register codec)
- Modify: `src-tauri/src/server/router.rs` (add /v1/messages route)

**Context:** Anthropic Messages API is the most structurally different from OpenAI. Key differences:
- `system` is a top-level field, not a message
- `max_tokens` is required
- Content is always an array of typed blocks (`{type: "text", text: "..."}`)
- Streaming uses named events: `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`
- Auth: `x-api-key` header + `anthropic-version: 2023-06-01`
- stop_reason values: `end_turn`, `max_tokens`, `stop_sequence`, `tool_use`

**Step 1: Create src-tauri/src/modality/chat/anthropic.rs**

The implementer should create this file with:
- Anthropic wire types matching the official API spec exactly (AnthropicRequest, AnthropicResponse, AnthropicMessage, content block types, streaming event types)
- Decoder impl that converts Anthropic format → IR
  - `system` field → `ir.system`
  - Content blocks → IrContent::Parts
  - `tool_use` content blocks → IrToolCall
  - `tool_result` content blocks → IrMessage with role Tool
  - Streaming: accumulate state across `message_start`, `content_block_start`, `content_block_delta`, `message_delta` events
  - Parse SSE `event:` lines to determine event type, `data:` lines for payload
  - `is_stream_done` returns true for `message_stop` event type
- Encoder impl that converts IR → Anthropic format
  - `ir.system` → top-level `system` field
  - `ir.max_tokens` defaults to 4096 if not set (Anthropic requires it)
  - IrContent::Text → `[{type: "text", text: "..."}]`
  - IrToolCall → `{type: "tool_use", id, name, input}`
  - Streaming: emit proper Anthropic SSE event sequence

Key Anthropic SSE streaming details:
- Events have both `event:` and `data:` lines
- `content_block_delta` with `delta.type = "text_delta"` carries `delta.text`
- `content_block_delta` with `delta.type = "input_json_delta"` carries `delta.partial_json`
- `message_delta` carries `delta.stop_reason` and `usage.output_tokens`
- For the Decoder: the `data:` line content needs to be parsed, and the `event:` type determines the structure
- For the Encoder: must emit proper `event:` + `data:` line pairs

**Step 2: Register in mod.rs**

Uncomment `pub mod anthropic;` and add to `get_decoder` / `get_encoder`:
```rust
ChatFormat::Anthropic => Box::new(anthropic::AnthropicCodec),
```

**Step 3: Add route in router.rs**

```rust
.route("/v1/messages", post(handle_anthropic))
```

With handler:
```rust
async fn handle_anthropic(
    state: State<ProxyState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, crate::error::AppError> {
    proxy::proxy_chat(state, headers, ChatFormat::Anthropic, body).await
}
```

**Step 4: Verify compilation**

```bash
cd src-tauri && cargo check
```

**Step 5: Commit**

```bash
git add src-tauri/src/modality/chat/anthropic.rs src-tauri/src/modality/chat/mod.rs src-tauri/src/server/router.rs
git commit -m "feat(codec): implement Anthropic Messages decoder and encoder"
```

---

### Task 5: Gemini codec

**Files:**
- Create: `src-tauri/src/modality/chat/gemini.rs`
- Modify: `src-tauri/src/modality/chat/mod.rs` (register codec)
- Modify: `src-tauri/src/server/router.rs` (add Gemini route)

**Context:** Gemini API key differences:
- Role values: `"user"` and `"model"` (not `"assistant"`)
- Content structure: `{ role, parts: [{text: "..."}] }` — uses `parts` not `content`
- System instruction: separate `systemInstruction` field at request top level
- Tool definitions: `functionDeclarations` inside `tools` array, schema types are UPPERCASE
- Response: `candidates` array with `content.parts`, `finishReason` in UPPER_SNAKE_CASE
- Streaming: standard SSE but NO `[DONE]` signal — stream ends when connection closes, detect via `finishReason` in last chunk
- Auth: `x-goog-api-key` header
- Non-streaming URL: `/v1beta/models/{model}:generateContent`
- Streaming URL: `/v1beta/models/{model}:streamGenerateContent?alt=sse`
- Function calling uses `functionCall` / `functionResponse` parts (not separate message roles)

**Step 1: Create src-tauri/src/modality/chat/gemini.rs**

The implementer should create this file with:
- Gemini wire types (GeminiRequest, GeminiResponse, Content, Part, GenerationConfig, etc.)
- Decoder: converts Gemini parts → IrContentPart, `"model"` role → `IrRole::Assistant`, `functionCall` parts → IrToolCall, `finishReason` UPPERCASE → IrFinishReason
- Encoder: converts IR → Gemini format, IrRole::Assistant → `"model"`, system → `systemInstruction`, tools → `functionDeclarations`, UPPERCASE schema types
- Streaming: `is_stream_done` always returns false (Gemini has no done signal — handle via connection close in proxy)

**Step 2: Register and add route**

Similar to Task 4.

**Step 3: Update build_upstream_url in proxy.rs**

Gemini needs different URLs for streaming vs non-streaming:
- Non-streaming: `{base}/v1beta/models/{model}:generateContent`
- Streaming: `{base}/v1beta/models/{model}:streamGenerateContent?alt=sse`

The `build_upstream_url` function should check `ir.stream` to choose the right endpoint. Update the proxy handler to pass the stream flag.

**Step 4: Verify and commit**

---

### Task 6: Moonshot codec

**Files:**
- Create: `src-tauri/src/modality/chat/moonshot.rs`
- Modify: `src-tauri/src/modality/chat/mod.rs`

**Context:** Moonshot (Kimi) API is OpenAI-compatible with minor additions:
- Base URL: `https://api.moonshot.cn`
- Same endpoint: `/v1/chat/completions`
- Same request/response format as OpenAI Chat Completions
- Additional: `builtin_function` tool type with `$web_search`
- Auth: `Authorization: Bearer <key>` (same as OpenAI)
- Recommended temperature: 0.6

Since Moonshot is OpenAI-compatible, the codec can delegate to `OpenAiChatCodec` for most operations. Create a thin wrapper that handles Moonshot-specific features (like `builtin_function` tool type passthrough).

**Step 1: Create src-tauri/src/modality/chat/moonshot.rs**

```rust
use super::ir::*;
use super::openai_chat::OpenAiChatCodec;
use super::{Decoder, Encoder};
use crate::error::AppError;

/// Moonshot codec — delegates to OpenAI Chat codec.
/// Moonshot API is OpenAI-compatible with minor additions.
pub struct MoonshotCodec;

impl Decoder for MoonshotCodec {
    fn decode_request(&self, body: &[u8]) -> Result<IrChatRequest, AppError> {
        OpenAiChatCodec.decode_request(body)
    }

    fn decode_response(&self, body: &[u8]) -> Result<IrChatResponse, AppError> {
        OpenAiChatCodec.decode_response(body)
    }

    fn decode_stream_chunk(&self, data: &str) -> Result<Option<IrStreamChunk>, AppError> {
        OpenAiChatCodec.decode_stream_chunk(data)
    }

    fn is_stream_done(&self, data: &str) -> bool {
        OpenAiChatCodec.is_stream_done(data)
    }
}

impl Encoder for MoonshotCodec {
    fn encode_request(&self, ir: &IrChatRequest, model: &str) -> Result<Vec<u8>, AppError> {
        OpenAiChatCodec.encode_request(ir, model)
    }

    fn encode_response(&self, ir: &IrChatResponse) -> Result<Vec<u8>, AppError> {
        OpenAiChatCodec.encode_response(ir)
    }

    fn encode_stream_chunk(&self, chunk: &IrStreamChunk) -> Result<Option<String>, AppError> {
        OpenAiChatCodec.encode_stream_chunk(chunk)
    }

    fn stream_done_signal(&self) -> Option<String> {
        Some("[DONE]".to_string())
    }
}
```

**Step 2: Update mod.rs**

Replace `ChatFormat::Moonshot` mapping from `OpenAiChatCodec` to `MoonshotCodec`.

**Step 3: Verify and commit**

---

### Task 7: OpenAI Responses codec

**Files:**
- Create: `src-tauri/src/modality/chat/openai_responses.rs`
- Modify: `src-tauri/src/modality/chat/mod.rs`
- Modify: `src-tauri/src/server/router.rs` (add /v1/responses route)

**Context:** OpenAI Responses API is a newer format with different structure:
- Endpoint: `POST /v1/responses`
- Request: `{ model, input: [...], stream, temperature, max_output_tokens, tools, ... }`
  - `input` can be a string or array of input items (messages)
  - Uses `max_output_tokens` not `max_tokens`
- Response: `{ id, object: "response", model, output: [{type: "message", role, content: [{type: "output_text", text}]}], usage }`
- Streaming: Different event types from Chat Completions — `response.created`, `response.output_item.added`, `response.content_part.added`, `response.output_text.delta`, `response.output_text.done`, `response.completed`
- Auth: same as OpenAI (`Authorization: Bearer <key>`)

The implementer should create the full codec following the same Decoder/Encoder pattern, mapping between the Responses format and the IR.

**Step 1: Create the codec file**

**Step 2: Register and add route**

**Step 3: Verify and commit**

---

### Task 8: Channel routing + load balancing + circuit breaker

**Files:**
- Create: `src-tauri/src/routing/mod.rs`
- Create: `src-tauri/src/routing/balancer.rs`
- Create: `src-tauri/src/routing/circuit.rs`
- Modify: `src-tauri/src/lib.rs` (add routing module)
- Modify: `src-tauri/src/server/proxy.rs` (use router instead of raw SQL)

**Context:** The routing system selects the best channel for a given model:
1. Find all enabled channels that have a mapping for the requested model
2. Group by priority (lower number = higher priority)
3. Within highest-priority group, select by weighted random
4. If selected channel's circuit breaker is open, try next
5. If all channels in current priority fail, fallback to next priority group
6. If all priorities exhausted, return AllChannelsFailed error

Circuit breaker:
- Track consecutive failures per channel (in-memory)
- After N consecutive failures (default 5), open circuit (disable channel temporarily)
- After a cooldown period (default 60s), allow one probe request (half-open)
- If probe succeeds, close circuit (re-enable)
- If probe fails, reset cooldown timer

**Step 1: Create src-tauri/src/routing/mod.rs**

```rust
pub mod balancer;
pub mod circuit;
```

**Step 2: Create src-tauri/src/routing/balancer.rs**

Implement `select_channel()`:
- Input: model name, SqlitePool, circuit breaker state
- Query channels + mappings from DB
- Group by priority, sort ascending
- Within each priority group, do weighted random selection (using `rand`)
- Skip channels with open circuit breakers
- Return selected (Channel, ModelMapping, api_key)
- Error if none available

**Step 3: Create src-tauri/src/routing/circuit.rs**

Implement circuit breaker as an in-memory `DashMap<String, CircuitState>` or `Arc<Mutex<HashMap>>`:
```rust
pub struct CircuitBreaker {
    states: std::sync::Mutex<HashMap<String, ChannelCircuit>>,
    failure_threshold: u32,
    cooldown: std::time::Duration,
}

struct ChannelCircuit {
    consecutive_failures: u32,
    state: CircuitState,
    last_failure: Option<std::time::Instant>,
}

enum CircuitState {
    Closed,   // healthy
    Open,     // disabled
    HalfOpen, // probing
}
```

Methods: `is_available(channel_id)`, `record_success(channel_id)`, `record_failure(channel_id)`

**Step 4: Update proxy.rs**

Replace the raw SQL channel lookup with `balancer::select_channel()`.
After upstream response, call `circuit.record_success()` or `circuit.record_failure()`.

**Step 5: Verify and commit**

---

### Task 9: Router integration — all endpoints + format detection

**Files:**
- Modify: `src-tauri/src/server/router.rs` (add all remaining routes)
- Modify: `src-tauri/src/server/proxy.rs` (refine Gemini URL handling)
- Modify: `src-tauri/src/server/mod.rs` (pass circuit breaker state)

**Context:** Wire up all remaining API endpoints:

```
POST /v1/chat/completions   → OpenAI Chat format input
POST /v1/responses           → OpenAI Responses format input
POST /v1/messages            → Anthropic format input
POST /v1/gemini/*            → Gemini format input (path-based model)
POST /v1/models              → Return list of available models from DB
```

Also add:
- Model list endpoint: query all distinct `public_name` from model_mappings
- Pass `CircuitBreaker` as shared state via `Arc`

**Step 1: Update router with all endpoints**

**Step 2: Add GET /v1/models endpoint**

```rust
async fn list_models(State(state): State<ProxyState>) -> Result<Json<Value>, AppError> {
    let models: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT public_name FROM model_mappings"
    )
    .fetch_all(&state.db)
    .await?;

    let model_list: Vec<Value> = models.iter().map(|m| json!({
        "id": m,
        "object": "model",
        "owned_by": "anyllm",
    })).collect();

    Ok(Json(json!({
        "object": "list",
        "data": model_list,
    })))
}
```

**Step 3: Verify all routes compile and commit**

---

## Summary

After completing all 9 tasks, the core conversion engine provides:

| Component | Status |
|-----------|--------|
| Chat IR (intermediate representation) | Complete |
| OpenAI Chat Completions codec | Decoder + Encoder + Streaming |
| OpenAI Responses codec | Decoder + Encoder + Streaming |
| Anthropic Messages codec | Decoder + Encoder + Streaming |
| Gemini codec | Decoder + Encoder + Streaming |
| Moonshot codec | Decoder + Encoder + Streaming (delegates to OpenAI) |
| Proxy handler | Non-streaming + SSE streaming pipeline |
| Channel routing | Priority + weighted random selection |
| Circuit breaker | Failure detection + auto-disable + recovery |
| Auth middleware | Bearer token validation |
| Format detection | Route-based input + X-Output-Format output |
| API endpoints | 5 proxy routes + /health + /v1/models |

**Next:** Phase 3 — Management frontend pages (Channels CRUD, Model Mappings, Tokens, Request Logs, Auth middleware with logging).
