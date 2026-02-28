use super::helpers::{from_json, from_json_str, from_json_value, to_json, to_json_str};
use super::ir::*;
use super::{Decoder, Encoder};
use crate::error::AppError;
use serde::{Deserialize, Serialize};

pub struct AnthropicCodec;

// --- Anthropic Wire Types (Request) ---

#[derive(Debug, Serialize, Deserialize)]
pub struct AnthropicRequest {
    pub model: String,
    pub messages: Vec<AnthropicMessage>,
    pub max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<serde_json::Value>, // string or array of content blocks (for prompt caching)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_sequences: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<AnthropicTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<AnthropicToolChoice>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnthropicMessage {
    pub role: String,
    pub content: serde_json::Value, // string or array of content blocks
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnthropicTool {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub input_schema: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnthropicToolChoice {
    #[serde(rename = "type")]
    pub choice_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

// --- Anthropic Wire Types (Response) ---

#[derive(Debug, Serialize, Deserialize)]
pub struct AnthropicResponse {
    pub id: String,
    #[serde(rename = "type")]
    pub resp_type: String,
    pub role: String,
    pub content: Vec<AnthropicContentBlock>,
    pub model: String,
    pub stop_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<AnthropicUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AnthropicContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnthropicUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

// --- Streaming event types ---
// Anthropic SSE uses `event:` + `data:` lines.
// The `data:` payload always has a `type` field matching the event name.

#[derive(Debug, Deserialize)]
pub struct StreamMessageStart {
    pub message: StreamMessageInfo,
}

#[derive(Debug, Deserialize)]
pub struct StreamMessageInfo {
    pub id: String,
    pub model: String,
    #[serde(default)]
    pub usage: Option<AnthropicUsage>,
}

#[derive(Debug, Deserialize)]
pub struct StreamContentBlockStart {
    pub index: u32,
    pub content_block: AnthropicContentBlock,
}

#[derive(Debug, Deserialize)]
pub struct StreamContentBlockDelta {
    pub index: u32,
    pub delta: StreamDelta,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum StreamDelta {
    #[serde(rename = "text_delta")]
    TextDelta { text: String },
    #[serde(rename = "input_json_delta")]
    InputJsonDelta { partial_json: String },
}

#[derive(Debug, Deserialize)]
pub struct StreamMessageDelta {
    pub delta: StreamMessageDeltaInner,
    #[serde(default)]
    pub usage: Option<StreamMessageDeltaUsage>,
}

#[derive(Debug, Deserialize)]
pub struct StreamMessageDeltaInner {
    pub stop_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct StreamMessageDeltaUsage {
    pub output_tokens: u32,
}

// --- Conversion helpers ---

fn anthropic_stop_to_ir(reason: &Option<String>) -> Option<IrFinishReason> {
    reason.as_ref().map(|r| match r.as_str() {
        "end_turn" | "stop_sequence" => IrFinishReason::Stop,
        "max_tokens" => IrFinishReason::Length,
        "tool_use" => IrFinishReason::ToolCalls,
        _ => IrFinishReason::Stop,
    })
}

fn ir_finish_to_anthropic(reason: &Option<IrFinishReason>) -> Option<String> {
    reason.as_ref().map(|r| match r {
        IrFinishReason::Stop => "end_turn".to_string(),
        IrFinishReason::Length => "max_tokens".to_string(),
        IrFinishReason::ToolCalls => "tool_use".to_string(),
        IrFinishReason::ContentFilter => "end_turn".to_string(),
    })
}

/// Convert Anthropic content (string or array of blocks) to IR content + tool_calls.
fn anthropic_content_to_ir(
    content: &serde_json::Value,
) -> (IrContent, Option<Vec<IrToolCall>>) {
    match content {
        serde_json::Value::String(s) => (IrContent::Text(s.clone()), None),
        serde_json::Value::Array(blocks) => {
            let mut parts = Vec::new();
            let mut tool_calls = Vec::new();

            for block in blocks {
                let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                match block_type {
                    "text" => {
                        if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                            parts.push(IrContentPart::Text {
                                text: text.to_string(),
                            });
                        }
                    }
                    "image" => {
                        if let Some(source) = block.get("source") {
                            parts.push(IrContentPart::Image {
                                url: None,
                                media_type: source
                                    .get("media_type")
                                    .and_then(|m| m.as_str())
                                    .map(String::from),
                                data: source
                                    .get("data")
                                    .and_then(|d| d.as_str())
                                    .map(String::from),
                            });
                        }
                    }
                    "tool_use" => {
                        let id = block
                            .get("id")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let name = block
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let input = block
                            .get("input")
                            .cloned()
                            .unwrap_or(serde_json::json!({}));
                        tool_calls.push(IrToolCall {
                            id,
                            name,
                            arguments: serde_json::to_string(&input).unwrap_or_default(),
                        });
                    }
                    "tool_result" => {
                        // tool_result blocks are handled at the message level
                    }
                    _ => {}
                }
            }

            let ir_content = if parts.len() == 1 {
                if let IrContentPart::Text { text } = &parts[0] {
                    IrContent::Text(text.clone())
                } else {
                    IrContent::Parts(parts)
                }
            } else if parts.is_empty() {
                IrContent::Text(String::new())
            } else {
                IrContent::Parts(parts)
            };

            let tc = if tool_calls.is_empty() {
                None
            } else {
                Some(tool_calls)
            };

            (ir_content, tc)
        }
        _ => (IrContent::Text(String::new()), None),
    }
}

/// Convert IR content to Anthropic content blocks array.
fn ir_content_to_anthropic(content: &IrContent) -> Vec<serde_json::Value> {
    match content {
        IrContent::Text(s) => {
            if s.is_empty() {
                vec![]
            } else {
                vec![serde_json::json!({"type": "text", "text": s})]
            }
        }
        IrContent::Parts(parts) => parts
            .iter()
            .map(|p| match p {
                IrContentPart::Text { text } => {
                    serde_json::json!({"type": "text", "text": text})
                }
                IrContentPart::Image {
                    url,
                    media_type,
                    data,
                } => {
                    if let Some(data) = data {
                        serde_json::json!({
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type.as_deref().unwrap_or("image/png"),
                                "data": data,
                            }
                        })
                    } else if let Some(url) = url {
                        serde_json::json!({
                            "type": "image",
                            "source": {
                                "type": "url",
                                "url": url,
                            }
                        })
                    } else {
                        serde_json::json!({"type": "text", "text": "[image]"})
                    }
                }
            })
            .collect(),
    }
}

// --- Decoder impl ---

impl Decoder for AnthropicCodec {
    fn decode_request(&self, body: &[u8]) -> Result<IrChatRequest, AppError> {
        let req: AnthropicRequest =
            from_json(body)?;

        let mut messages = Vec::new();

        for msg in &req.messages {
            if msg.role == "user" || msg.role == "assistant" {
                let (content, tool_calls) = anthropic_content_to_ir(&msg.content);

                // Check for tool_result blocks in user messages
                if msg.role == "user" {
                    if let serde_json::Value::Array(blocks) = &msg.content {
                        for block in blocks {
                            if block.get("type").and_then(|t| t.as_str()) == Some("tool_result") {
                                let tool_use_id = block
                                    .get("tool_use_id")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                let result_content = block
                                    .get("content")
                                    .map(|c| {
                                        if c.is_string() {
                                            c.as_str().unwrap_or("").to_string()
                                        } else {
                                            serde_json::to_string(c).unwrap_or_default()
                                        }
                                    })
                                    .unwrap_or_default();

                                messages.push(IrMessage {
                                    role: IrRole::Tool,
                                    content: IrContent::Text(result_content),
                                    tool_calls: None,
                                    tool_call_id: Some(tool_use_id),
                                    name: None,
                                });
                            }
                        }

                        // If there were non-tool_result blocks, add the user message
                        let has_non_tool = blocks.iter().any(|b| {
                            b.get("type").and_then(|t| t.as_str()) != Some("tool_result")
                        });
                        if has_non_tool {
                            messages.push(IrMessage {
                                role: IrRole::User,
                                content,
                                tool_calls: None,
                                tool_call_id: None,
                                name: None,
                            });
                        }
                        continue;
                    }
                }

                let role = if msg.role == "assistant" {
                    IrRole::Assistant
                } else {
                    IrRole::User
                };

                messages.push(IrMessage {
                    role,
                    content,
                    tool_calls,
                    tool_call_id: None,
                    name: None,
                });
            }
        }

        let tools = req.tools.map(|ts| {
            ts.into_iter()
                .map(|t| IrTool {
                    name: t.name,
                    description: t.description,
                    parameters: t.input_schema,
                })
                .collect()
        });

        let tool_choice = req.tool_choice.map(|tc| match tc.choice_type.as_str() {
            "auto" => IrToolChoice::Auto,
            "any" => IrToolChoice::Any,
            "tool" => IrToolChoice::Tool {
                name: tc.name.unwrap_or_default(),
            },
            _ => IrToolChoice::Auto,
        });

        // system can be a plain string or an array of content blocks (prompt caching)
        let system = req.system.map(|s| match s {
            serde_json::Value::String(text) => text,
            serde_json::Value::Array(blocks) => blocks
                .iter()
                .filter_map(|b| {
                    if b.get("type").and_then(|t| t.as_str()) == Some("text") {
                        b.get("text").and_then(|t| t.as_str()).map(String::from)
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
                .join(""),
            other => other.to_string(),
        });

        Ok(IrChatRequest {
            model: req.model,
            messages,
            system,
            temperature: req.temperature,
            top_p: req.top_p,
            max_tokens: Some(req.max_tokens),
            stream: req.stream.unwrap_or(false),
            stop: req.stop_sequences,
            tools,
            tool_choice,
            extra: None,
        })
    }

    fn decode_response(&self, body: &[u8]) -> Result<IrChatResponse, AppError> {
        let resp: AnthropicResponse =
            from_json(body)?;

        let mut text_parts = Vec::new();
        let mut tool_calls = Vec::new();

        for block in &resp.content {
            match block {
                AnthropicContentBlock::Text { text } => {
                    text_parts.push(text.clone());
                }
                AnthropicContentBlock::ToolUse { id, name, input } => {
                    tool_calls.push(IrToolCall {
                        id: id.clone(),
                        name: name.clone(),
                        arguments: serde_json::to_string(input).unwrap_or_default(),
                    });
                }
            }
        }

        let content = IrContent::Text(text_parts.join(""));
        let tc = if tool_calls.is_empty() {
            None
        } else {
            Some(tool_calls)
        };

        Ok(IrChatResponse {
            id: resp.id,
            model: resp.model,
            message: IrMessage {
                role: IrRole::Assistant,
                content,
                tool_calls: tc,
                tool_call_id: None,
                name: None,
            },
            finish_reason: anthropic_stop_to_ir(&resp.stop_reason),
            usage: resp.usage.map(|u| IrUsage {
                prompt_tokens: u.input_tokens,
                completion_tokens: u.output_tokens,
                total_tokens: Some(u.input_tokens + u.output_tokens),
            }),
        })
    }

    fn decode_stream_chunk(&self, data: &str) -> Result<Option<IrStreamChunk>, AppError> {
        if data.trim().is_empty() || self.is_stream_done(data) {
            return Ok(None);
        }

        // Parse the JSON to determine the event type
        let v: serde_json::Value =
            from_json_str(data)?;

        let event_type = v
            .get("type")
            .and_then(|t| t.as_str())
            .unwrap_or("");

        match event_type {
            "message_start" => {
                let evt: StreamMessageStart =
                    from_json_value(v)?;
                Ok(Some(IrStreamChunk {
                    id: evt.message.id,
                    model: Some(evt.message.model),
                    delta_role: Some(IrRole::Assistant),
                    delta_content: None,
                    delta_tool_calls: None,
                    finish_reason: None,
                    usage: evt.message.usage.map(|u| IrUsage {
                        prompt_tokens: u.input_tokens,
                        completion_tokens: u.output_tokens,
                        total_tokens: Some(u.input_tokens + u.output_tokens),
                    }),
                }))
            }
            "content_block_start" => {
                let evt: StreamContentBlockStart =
                    from_json_value(v)?;
                match &evt.content_block {
                    AnthropicContentBlock::ToolUse { id, name, .. } => {
                        Ok(Some(IrStreamChunk {
                            id: String::new(),
                            model: None,
                            delta_role: None,
                            delta_content: None,
                            delta_tool_calls: Some(vec![IrToolCallDelta {
                                index: evt.index,
                                id: Some(id.clone()),
                                name: Some(name.clone()),
                                arguments: None,
                            }]),
                            finish_reason: None,
                            usage: None,
                        }))
                    }
                    _ => Ok(None),
                }
            }
            "content_block_delta" => {
                let evt: StreamContentBlockDelta =
                    from_json_value(v)?;
                match &evt.delta {
                    StreamDelta::TextDelta { text } => Ok(Some(IrStreamChunk {
                        id: String::new(),
                        model: None,
                        delta_role: None,
                        delta_content: Some(text.clone()),
                        delta_tool_calls: None,
                        finish_reason: None,
                        usage: None,
                    })),
                    StreamDelta::InputJsonDelta { partial_json } => {
                        Ok(Some(IrStreamChunk {
                            id: String::new(),
                            model: None,
                            delta_role: None,
                            delta_content: None,
                            delta_tool_calls: Some(vec![IrToolCallDelta {
                                index: evt.index,
                                id: None,
                                name: None,
                                arguments: Some(partial_json.clone()),
                            }]),
                            finish_reason: None,
                            usage: None,
                        }))
                    }
                }
            }
            "message_delta" => {
                let evt: StreamMessageDelta =
                    from_json_value(v)?;
                Ok(Some(IrStreamChunk {
                    id: String::new(),
                    model: None,
                    delta_role: None,
                    delta_content: None,
                    delta_tool_calls: None,
                    finish_reason: anthropic_stop_to_ir(&evt.delta.stop_reason),
                    usage: evt.usage.map(|u| IrUsage {
                        prompt_tokens: 0,
                        completion_tokens: u.output_tokens,
                        total_tokens: None,
                    }),
                }))
            }
            "content_block_stop" | "ping" => Ok(None),
            _ => Ok(None),
        }
    }

    fn is_stream_done(&self, data: &str) -> bool {
        // Anthropic signals end with message_stop event
        data.contains("\"type\":\"message_stop\"") || data.contains("\"type\": \"message_stop\"")
    }
}

// --- Encoder impl ---

impl Encoder for AnthropicCodec {
    fn encode_request(&self, ir: &IrChatRequest, model: &str) -> Result<Vec<u8>, AppError> {
        let mut messages = Vec::new();

        for msg in &ir.messages {
            match msg.role {
                IrRole::System => {
                    // System messages should be in the top-level system field, skip here
                    continue;
                }
                IrRole::User => {
                    let content_blocks = ir_content_to_anthropic(&msg.content);
                    messages.push(AnthropicMessage {
                        role: "user".to_string(),
                        content: serde_json::Value::Array(content_blocks),
                    });
                }
                IrRole::Assistant => {
                    let mut content_blocks = ir_content_to_anthropic(&msg.content);

                    // Add tool_use blocks
                    if let Some(tcs) = &msg.tool_calls {
                        for tc in tcs {
                            let input: serde_json::Value =
                                serde_json::from_str(&tc.arguments).unwrap_or(serde_json::json!({}));
                            content_blocks.push(serde_json::json!({
                                "type": "tool_use",
                                "id": tc.id,
                                "name": tc.name,
                                "input": input,
                            }));
                        }
                    }

                    if content_blocks.is_empty() {
                        content_blocks.push(serde_json::json!({"type": "text", "text": ""}));
                    }

                    messages.push(AnthropicMessage {
                        role: "assistant".to_string(),
                        content: serde_json::Value::Array(content_blocks),
                    });
                }
                IrRole::Tool => {
                    // Tool results become tool_result content blocks in a user message
                    let result_content = msg.content.to_text();
                    let block = serde_json::json!({
                        "type": "tool_result",
                        "tool_use_id": msg.tool_call_id.as_deref().unwrap_or(""),
                        "content": result_content,
                    });

                    // Try to merge with previous user message containing tool_results
                    let merged = if let Some(last) = messages.last_mut() {
                        if last.role == "user" {
                            if let serde_json::Value::Array(ref mut arr) = last.content {
                                let all_tool_results = arr.iter().all(|b| {
                                    b.get("type").and_then(|t| t.as_str()) == Some("tool_result")
                                });
                                if all_tool_results {
                                    arr.push(block.clone());
                                    true
                                } else {
                                    false
                                }
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    } else {
                        false
                    };

                    if !merged {
                        messages.push(AnthropicMessage {
                            role: "user".to_string(),
                            content: serde_json::Value::Array(vec![block]),
                        });
                    }
                }
            }
        }

        let tools = ir.tools.as_ref().map(|ts| {
            ts.iter()
                .map(|t| AnthropicTool {
                    name: t.name.clone(),
                    description: t.description.clone(),
                    input_schema: t.parameters.clone(),
                })
                .collect::<Vec<_>>()
        });

        let tool_choice = ir.tool_choice.as_ref().map(|tc| match tc {
            IrToolChoice::Auto => AnthropicToolChoice {
                choice_type: "auto".to_string(),
                name: None,
            },
            IrToolChoice::None => AnthropicToolChoice {
                choice_type: "auto".to_string(),
                name: None,
            },
            IrToolChoice::Any => AnthropicToolChoice {
                choice_type: "any".to_string(),
                name: None,
            },
            IrToolChoice::Tool { name } => AnthropicToolChoice {
                choice_type: "tool".to_string(),
                name: Some(name.clone()),
            },
        });

        let req = AnthropicRequest {
            model: model.to_string(),
            messages,
            max_tokens: ir.max_tokens.unwrap_or(4096),
            system: ir.system.as_deref().map(|s| serde_json::Value::String(s.to_string())),
            temperature: ir.temperature,
            top_p: ir.top_p,
            stop_sequences: ir.stop.clone(),
            stream: if ir.stream { Some(true) } else { None },
            tools,
            tool_choice,
        };

        to_json(&req)
    }

    fn encode_response(&self, ir: &IrChatResponse) -> Result<Vec<u8>, AppError> {
        let mut content = Vec::new();

        let text = ir.message.content.to_text();
        if !text.is_empty() {
            content.push(AnthropicContentBlock::Text { text });
        }

        if let Some(tcs) = &ir.message.tool_calls {
            for tc in tcs {
                let input: serde_json::Value =
                    serde_json::from_str(&tc.arguments).unwrap_or(serde_json::json!({}));
                content.push(AnthropicContentBlock::ToolUse {
                    id: tc.id.clone(),
                    name: tc.name.clone(),
                    input,
                });
            }
        }

        if content.is_empty() {
            content.push(AnthropicContentBlock::Text {
                text: String::new(),
            });
        }

        let resp = AnthropicResponse {
            id: ir.id.clone(),
            resp_type: "message".to_string(),
            role: "assistant".to_string(),
            content,
            model: ir.model.clone(),
            stop_reason: ir_finish_to_anthropic(&ir.finish_reason),
            usage: ir.usage.as_ref().map(|u| AnthropicUsage {
                input_tokens: u.prompt_tokens,
                output_tokens: u.completion_tokens,
            }),
        };

        to_json(&resp)
    }

    fn encode_stream_chunk(&mut self, chunk: &IrStreamChunk) -> Result<Option<String>, AppError> {
        let mut events = Vec::new();

        // message_start event (when we have role + id)
        if chunk.delta_role.is_some() && !chunk.id.is_empty() {
            let input_tokens = chunk
                .usage
                .as_ref()
                .map(|u| u.prompt_tokens)
                .unwrap_or(0);
            let msg_start = serde_json::json!({
                "type": "message_start",
                "message": {
                    "id": chunk.id,
                    "type": "message",
                    "role": "assistant",
                    "content": [],
                    "model": chunk.model.as_deref().unwrap_or(""),
                    "stop_reason": null,
                    "usage": {
                        "input_tokens": input_tokens,
                        "output_tokens": 0,
                    }
                }
            });
            events.push(format!(
                "event: message_start\ndata: {}",
                to_json_str(&msg_start)?
            ));
        }

        // content_block_delta for text
        if let Some(text) = &chunk.delta_content {
            let delta = serde_json::json!({
                "type": "content_block_delta",
                "index": 0,
                "delta": {
                    "type": "text_delta",
                    "text": text,
                }
            });
            events.push(format!(
                "event: content_block_delta\ndata: {}",
                to_json_str(&delta)?
            ));
        }

        // tool call deltas
        if let Some(tcs) = &chunk.delta_tool_calls {
            for tc in tcs {
                if tc.id.is_some() || tc.name.is_some() {
                    // content_block_start for tool_use
                    let block_start = serde_json::json!({
                        "type": "content_block_start",
                        "index": tc.index,
                        "content_block": {
                            "type": "tool_use",
                            "id": tc.id.as_deref().unwrap_or(""),
                            "name": tc.name.as_deref().unwrap_or(""),
                            "input": {},
                        }
                    });
                    events.push(format!(
                        "event: content_block_start\ndata: {}",
                        to_json_str(&block_start)?
                    ));
                }
                if let Some(args) = &tc.arguments {
                    let delta = serde_json::json!({
                        "type": "content_block_delta",
                        "index": tc.index,
                        "delta": {
                            "type": "input_json_delta",
                            "partial_json": args,
                        }
                    });
                    events.push(format!(
                        "event: content_block_delta\ndata: {}",
                        to_json_str(&delta)?
                    ));
                }
            }
        }

        // message_delta for finish_reason
        if let Some(reason) = &chunk.finish_reason {
            let stop_reason = match reason {
                IrFinishReason::Stop => "end_turn",
                IrFinishReason::Length => "max_tokens",
                IrFinishReason::ToolCalls => "tool_use",
                IrFinishReason::ContentFilter => "end_turn",
            };
            let output_tokens = chunk
                .usage
                .as_ref()
                .map(|u| u.completion_tokens)
                .unwrap_or(0);
            let msg_delta = serde_json::json!({
                "type": "message_delta",
                "delta": {
                    "stop_reason": stop_reason,
                },
                "usage": {
                    "output_tokens": output_tokens,
                }
            });
            events.push(format!(
                "event: message_delta\ndata: {}",
                to_json_str(&msg_delta)?
            ));
        }

        if events.is_empty() {
            Ok(None)
        } else {
            // Join multiple events — each will be sent as a separate SSE block
            // The proxy SSE layer wraps each line in "data: ...\n\n" so we need
            // to return the raw content. Since we handle event: lines ourselves,
            // return as a single string (the proxy will wrap it).
            Ok(Some(events.join("\n\n")))
        }
    }

    fn stream_done_signal(&mut self) -> Option<String> {
        Some(r#"event: message_stop
data: {"type":"message_stop"}"#.to_string())
    }
}
