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
