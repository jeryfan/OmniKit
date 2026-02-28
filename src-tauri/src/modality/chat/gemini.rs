use super::helpers::{from_json, from_json_str, to_json, to_json_str};
use super::ir::*;
use super::{Decoder, Encoder};
use crate::error::AppError;
use serde::{Deserialize, Serialize};

pub struct GeminiCodec;

// --- Gemini Wire Types (Request) ---

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiRequest {
    pub contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_instruction: Option<GeminiSystemInstruction>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generation_config: Option<GeminiGenerationConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<GeminiToolDeclaration>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_config: Option<GeminiToolConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GeminiContent {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    pub parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GeminiSystemInstruction {
    pub parts: Vec<GeminiPart>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiPart {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inline_data: Option<GeminiInlineData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function_call: Option<GeminiFunctionCall>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function_response: Option<GeminiFunctionResponse>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiInlineData {
    pub mime_type: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeminiFunctionCall {
    pub name: String,
    #[serde(default)]
    pub args: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeminiFunctionResponse {
    pub name: String,
    pub response: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiGenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_sequences: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiToolDeclaration {
    pub function_declarations: Vec<GeminiFunctionDeclaration>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GeminiFunctionDeclaration {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiToolConfig {
    pub function_calling_config: GeminiFunctionCallingConfig,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiFunctionCallingConfig {
    pub mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_function_names: Option<Vec<String>>,
}

// --- Gemini Wire Types (Response) ---

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiResponse {
    #[serde(default)]
    pub candidates: Vec<GeminiCandidate>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage_metadata: Option<GeminiUsageMetadata>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiCandidate {
    pub content: GeminiContent,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiUsageMetadata {
    #[serde(default)]
    pub prompt_token_count: u32,
    #[serde(default)]
    pub candidates_token_count: u32,
    #[serde(default)]
    pub total_token_count: u32,
}

// --- Conversion helpers ---

fn gemini_role_to_ir(role: &str) -> IrRole {
    match role {
        "model" => IrRole::Assistant,
        "user" => IrRole::User,
        _ => IrRole::User,
    }
}

fn ir_role_to_gemini(role: &IrRole) -> &'static str {
    match role {
        IrRole::User => "user",
        IrRole::Assistant => "model",
        IrRole::System => "user",
        IrRole::Tool => "user",
    }
}

fn gemini_finish_to_ir(reason: &Option<String>) -> Option<IrFinishReason> {
    reason.as_ref().map(|r| match r.as_str() {
        "STOP" => IrFinishReason::Stop,
        "MAX_TOKENS" => IrFinishReason::Length,
        "SAFETY" => IrFinishReason::ContentFilter,
        "RECITATION" => IrFinishReason::ContentFilter,
        _ => IrFinishReason::Stop,
    })
}

fn ir_finish_to_gemini(reason: &Option<IrFinishReason>) -> Option<String> {
    reason.as_ref().map(|r| match r {
        IrFinishReason::Stop => "STOP".to_string(),
        IrFinishReason::Length => "MAX_TOKENS".to_string(),
        IrFinishReason::ToolCalls => "STOP".to_string(),
        IrFinishReason::ContentFilter => "SAFETY".to_string(),
    })
}

/// Convert Gemini parts into IR content + optional tool_calls.
fn gemini_parts_to_ir(parts: &[GeminiPart]) -> (IrContent, Option<Vec<IrToolCall>>) {
    let mut text_parts = Vec::new();
    let mut tool_calls = Vec::new();

    for (i, part) in parts.iter().enumerate() {
        if let Some(text) = &part.text {
            text_parts.push(text.clone());
        }
        if let Some(fc) = &part.function_call {
            tool_calls.push(IrToolCall {
                id: format!("call_{}", i),
                name: fc.name.clone(),
                arguments: serde_json::to_string(&fc.args).unwrap_or_default(),
            });
        }
    }

    let content = if text_parts.len() == 1 {
        IrContent::Text(text_parts.into_iter().next().unwrap())
    } else if text_parts.is_empty() {
        IrContent::Text(String::new())
    } else {
        IrContent::Text(text_parts.join(""))
    };

    let tc = if tool_calls.is_empty() {
        None
    } else {
        Some(tool_calls)
    };

    (content, tc)
}

/// Convert IR content into Gemini parts.
fn ir_content_to_gemini_parts(content: &IrContent) -> Vec<GeminiPart> {
    match content {
        IrContent::Text(s) => {
            if s.is_empty() {
                vec![]
            } else {
                vec![GeminiPart {
                    text: Some(s.clone()),
                    inline_data: None,
                    function_call: None,
                    function_response: None,
                }]
            }
        }
        IrContent::Parts(parts) => parts
            .iter()
            .filter_map(|p| match p {
                IrContentPart::Text { text } => Some(GeminiPart {
                    text: Some(text.clone()),
                    inline_data: None,
                    function_call: None,
                    function_response: None,
                }),
                IrContentPart::Image {
                    data, media_type, ..
                } => {
                    if let Some(data) = data {
                        Some(GeminiPart {
                            text: None,
                            inline_data: Some(GeminiInlineData {
                                mime_type: media_type
                                    .as_deref()
                                    .unwrap_or("image/png")
                                    .to_string(),
                                data: data.clone(),
                            }),
                            function_call: None,
                            function_response: None,
                        })
                    } else {
                        // Gemini doesn't support URL-based images directly;
                        // emit a text placeholder.
                        Some(GeminiPart {
                            text: Some("[image]".to_string()),
                            inline_data: None,
                            function_call: None,
                            function_response: None,
                        })
                    }
                }
            })
            .collect(),
    }
}

// --- Decoder impl ---

impl Decoder for GeminiCodec {
    fn decode_request(&self, body: &[u8]) -> Result<IrChatRequest, AppError> {
        let req: GeminiRequest =
            from_json(body)?;

        // Extract system instruction
        let system = req.system_instruction.as_ref().map(|si| {
            si.parts
                .iter()
                .filter_map(|p| p.text.as_deref())
                .collect::<Vec<_>>()
                .join("")
        });

        // Convert contents to IR messages
        let mut messages = Vec::new();
        for content in &req.contents {
            let role_str = content.role.as_deref().unwrap_or("user");

            // Check for functionResponse parts — these become Tool-role messages
            let has_function_response = content
                .parts
                .iter()
                .any(|p| p.function_response.is_some());

            if has_function_response {
                // Each functionResponse part becomes its own IR Tool message
                for part in &content.parts {
                    if let Some(fr) = &part.function_response {
                        messages.push(IrMessage {
                            role: IrRole::Tool,
                            content: IrContent::Text(
                                serde_json::to_string(&fr.response).unwrap_or_default(),
                            ),
                            tool_calls: None,
                            tool_call_id: None,
                            name: Some(fr.name.clone()),
                        });
                    }
                }
                continue;
            }

            let ir_role = gemini_role_to_ir(role_str);
            let (content_ir, tool_calls) = gemini_parts_to_ir(&content.parts);

            // If there are tool calls, the finish reason should map to ToolCalls
            messages.push(IrMessage {
                role: ir_role,
                content: content_ir,
                tool_calls,
                tool_call_id: None,
                name: None,
            });
        }

        // Extract tools
        let tools = req.tools.as_ref().map(|ts| {
            ts.iter()
                .flat_map(|t| {
                    t.function_declarations.iter().map(|fd| IrTool {
                        name: fd.name.clone(),
                        description: fd.description.clone(),
                        parameters: fd.parameters.clone().unwrap_or(serde_json::json!({})),
                    })
                })
                .collect()
        });

        // Extract tool_choice
        let tool_choice = req.tool_config.as_ref().map(|tc| {
            let mode = tc.function_calling_config.mode.as_str();
            match mode {
                "NONE" => IrToolChoice::None,
                "ANY" => {
                    // If allowedFunctionNames has exactly one name, treat as specific tool
                    if let Some(names) = &tc.function_calling_config.allowed_function_names {
                        if names.len() == 1 {
                            return IrToolChoice::Tool {
                                name: names[0].clone(),
                            };
                        }
                    }
                    IrToolChoice::Any
                }
                _ => IrToolChoice::Auto, // "AUTO" and anything else
            }
        });

        // Extract generation config
        let gen = req.generation_config.as_ref();

        Ok(IrChatRequest {
            model: String::new(), // Gemini model is in the URL path, not the body
            messages,
            system,
            temperature: gen.and_then(|g| g.temperature),
            top_p: gen.and_then(|g| g.top_p),
            max_tokens: gen.and_then(|g| g.max_output_tokens),
            stream: false, // Gemini stream is determined by the endpoint, not a body field
            stop: gen.and_then(|g| g.stop_sequences.clone()),
            tools,
            tool_choice,
            extra: None,
        })
    }

    fn decode_response(&self, body: &[u8]) -> Result<IrChatResponse, AppError> {
        let resp: GeminiResponse =
            from_json(body)?;

        let candidate = resp.candidates.into_iter().next().ok_or_else(|| {
            AppError::Codec("No candidates in Gemini response".to_string())
        })?;

        let (content, tool_calls) = gemini_parts_to_ir(&candidate.content.parts);

        // If there are tool calls, override finish_reason to ToolCalls
        let finish_reason = if tool_calls.is_some() {
            Some(IrFinishReason::ToolCalls)
        } else {
            gemini_finish_to_ir(&candidate.finish_reason)
        };

        Ok(IrChatResponse {
            id: String::new(), // Gemini responses don't have a top-level id
            model: String::new(),
            message: IrMessage {
                role: IrRole::Assistant,
                content,
                tool_calls,
                tool_call_id: None,
                name: None,
            },
            finish_reason,
            usage: resp.usage_metadata.map(|u| IrUsage {
                prompt_tokens: u.prompt_token_count,
                completion_tokens: u.candidates_token_count,
                total_tokens: Some(u.total_token_count),
            }),
        })
    }

    fn decode_stream_chunk(&self, data: &str) -> Result<Option<IrStreamChunk>, AppError> {
        if data.trim().is_empty() {
            return Ok(None);
        }

        // Each streaming chunk from Gemini has the same structure as a full response
        let chunk: GeminiResponse =
            from_json_str(data)?;

        let candidate = match chunk.candidates.first() {
            Some(c) => c,
            None => {
                // Usage-only chunk
                if let Some(usage) = &chunk.usage_metadata {
                    return Ok(Some(IrStreamChunk {
                        id: String::new(),
                        model: None,
                        delta_role: None,
                        delta_content: None,
                        delta_tool_calls: None,
                        finish_reason: None,
                        usage: Some(IrUsage {
                            prompt_tokens: usage.prompt_token_count,
                            completion_tokens: usage.candidates_token_count,
                            total_tokens: Some(usage.total_token_count),
                        }),
                    }));
                }
                return Ok(None);
            }
        };

        // Extract delta text from parts
        let mut delta_text_parts = Vec::new();
        let mut delta_tool_calls = Vec::new();

        for (i, part) in candidate.content.parts.iter().enumerate() {
            if let Some(text) = &part.text {
                delta_text_parts.push(text.clone());
            }
            if let Some(fc) = &part.function_call {
                delta_tool_calls.push(IrToolCallDelta {
                    index: i as u32,
                    id: Some(format!("call_{}", i)),
                    name: Some(fc.name.clone()),
                    arguments: Some(
                        serde_json::to_string(&fc.args).unwrap_or_default(),
                    ),
                });
            }
        }

        let delta_content = if delta_text_parts.is_empty() {
            None
        } else {
            Some(delta_text_parts.join(""))
        };

        let delta_tc = if delta_tool_calls.is_empty() {
            None
        } else {
            Some(delta_tool_calls)
        };

        // Map finish reason; if tool calls present, override to ToolCalls
        let finish_reason = if delta_tc.is_some() {
            Some(IrFinishReason::ToolCalls)
        } else {
            gemini_finish_to_ir(&candidate.finish_reason)
        };

        let role = candidate
            .content
            .role
            .as_deref()
            .map(gemini_role_to_ir);

        Ok(Some(IrStreamChunk {
            id: String::new(),
            model: None,
            delta_role: role,
            delta_content,
            delta_tool_calls: delta_tc,
            finish_reason,
            usage: chunk.usage_metadata.map(|u| IrUsage {
                prompt_tokens: u.prompt_token_count,
                completion_tokens: u.candidates_token_count,
                total_tokens: Some(u.total_token_count),
            }),
        }))
    }

    fn is_stream_done(&self, _data: &str) -> bool {
        // Gemini streams end when the connection closes; there is no [DONE] signal.
        false
    }
}

// --- Encoder impl ---

impl Encoder for GeminiCodec {
    fn encode_request(&self, ir: &IrChatRequest, _model: &str) -> Result<Vec<u8>, AppError> {
        let mut contents = Vec::new();

        for msg in &ir.messages {
            match msg.role {
                IrRole::System => {
                    // System messages are handled via systemInstruction, skip here
                    continue;
                }
                IrRole::User => {
                    let parts = ir_content_to_gemini_parts(&msg.content);
                    if !parts.is_empty() {
                        contents.push(GeminiContent {
                            role: Some("user".to_string()),
                            parts,
                        });
                    }
                }
                IrRole::Assistant => {
                    let mut parts = ir_content_to_gemini_parts(&msg.content);

                    // Add functionCall parts for tool calls
                    if let Some(tcs) = &msg.tool_calls {
                        for tc in tcs {
                            let args: serde_json::Value =
                                serde_json::from_str(&tc.arguments)
                                    .unwrap_or(serde_json::json!({}));
                            parts.push(GeminiPart {
                                text: None,
                                inline_data: None,
                                function_call: Some(GeminiFunctionCall {
                                    name: tc.name.clone(),
                                    args,
                                }),
                                function_response: None,
                            });
                        }
                    }

                    if !parts.is_empty() {
                        contents.push(GeminiContent {
                            role: Some("model".to_string()),
                            parts,
                        });
                    }
                }
                IrRole::Tool => {
                    // Tool result → functionResponse part in a "user" content
                    let response_value: serde_json::Value =
                        serde_json::from_str(&msg.content.to_text()).unwrap_or_else(|_| {
                            serde_json::json!({ "result": msg.content.to_text() })
                        });

                    let func_name = msg
                        .name
                        .clone()
                        .unwrap_or_else(|| "unknown".to_string());

                    contents.push(GeminiContent {
                        role: Some("user".to_string()),
                        parts: vec![GeminiPart {
                            text: None,
                            inline_data: None,
                            function_call: None,
                            function_response: Some(GeminiFunctionResponse {
                                name: func_name,
                                response: response_value,
                            }),
                        }],
                    });
                }
            }
        }

        // System instruction
        let system_instruction = ir.system.as_ref().map(|s| GeminiSystemInstruction {
            parts: vec![GeminiPart {
                text: Some(s.clone()),
                inline_data: None,
                function_call: None,
                function_response: None,
            }],
        });

        // Generation config
        let generation_config = if ir.temperature.is_some()
            || ir.top_p.is_some()
            || ir.max_tokens.is_some()
            || ir.stop.is_some()
        {
            Some(GeminiGenerationConfig {
                temperature: ir.temperature,
                top_p: ir.top_p,
                max_output_tokens: ir.max_tokens,
                stop_sequences: ir.stop.clone(),
            })
        } else {
            None
        };

        // Tools
        let tools = ir.tools.as_ref().map(|ts| {
            vec![GeminiToolDeclaration {
                function_declarations: ts
                    .iter()
                    .map(|t| GeminiFunctionDeclaration {
                        name: t.name.clone(),
                        description: t.description.clone(),
                        parameters: Some(t.parameters.clone()),
                    })
                    .collect(),
            }]
        });

        // Tool config
        let tool_config = ir.tool_choice.as_ref().map(|tc| {
            let (mode, allowed) = match tc {
                IrToolChoice::Auto => ("AUTO".to_string(), None),
                IrToolChoice::None => ("NONE".to_string(), None),
                IrToolChoice::Any => ("ANY".to_string(), None),
                IrToolChoice::Tool { name } => {
                    ("ANY".to_string(), Some(vec![name.clone()]))
                }
            };
            GeminiToolConfig {
                function_calling_config: GeminiFunctionCallingConfig {
                    mode,
                    allowed_function_names: allowed,
                },
            }
        });

        let req = GeminiRequest {
            contents,
            system_instruction,
            generation_config,
            tools,
            tool_config,
        };

        to_json(&req)
    }

    fn encode_response(&self, ir: &IrChatResponse) -> Result<Vec<u8>, AppError> {
        let mut parts = ir_content_to_gemini_parts(&ir.message.content);

        // Add functionCall parts for tool calls
        if let Some(tcs) = &ir.message.tool_calls {
            for tc in tcs {
                let args: serde_json::Value =
                    serde_json::from_str(&tc.arguments).unwrap_or(serde_json::json!({}));
                parts.push(GeminiPart {
                    text: None,
                    inline_data: None,
                    function_call: Some(GeminiFunctionCall {
                        name: tc.name.clone(),
                        args,
                    }),
                    function_response: None,
                });
            }
        }

        if parts.is_empty() {
            parts.push(GeminiPart {
                text: Some(String::new()),
                inline_data: None,
                function_call: None,
                function_response: None,
            });
        }

        let finish_reason = ir_finish_to_gemini(&ir.finish_reason);

        let resp = GeminiResponse {
            candidates: vec![GeminiCandidate {
                content: GeminiContent {
                    role: Some("model".to_string()),
                    parts,
                },
                finish_reason,
            }],
            usage_metadata: ir.usage.as_ref().map(|u| GeminiUsageMetadata {
                prompt_token_count: u.prompt_tokens,
                candidates_token_count: u.completion_tokens,
                total_token_count: u
                    .total_tokens
                    .unwrap_or(u.prompt_tokens + u.completion_tokens),
            }),
        };

        to_json(&resp)
    }

    fn encode_stream_chunk(&mut self, chunk: &IrStreamChunk) -> Result<Option<String>, AppError> {
        let mut parts = Vec::new();

        // Text delta
        if let Some(text) = &chunk.delta_content {
            parts.push(GeminiPart {
                text: Some(text.clone()),
                inline_data: None,
                function_call: None,
                function_response: None,
            });
        }

        // Tool call deltas
        if let Some(tcs) = &chunk.delta_tool_calls {
            for tc in tcs {
                if let (Some(name), Some(args_str)) = (&tc.name, &tc.arguments) {
                    let args: serde_json::Value =
                        serde_json::from_str(args_str).unwrap_or(serde_json::json!({}));
                    parts.push(GeminiPart {
                        text: None,
                        inline_data: None,
                        function_call: Some(GeminiFunctionCall {
                            name: name.clone(),
                            args,
                        }),
                        function_response: None,
                    });
                }
            }
        }

        // If no content parts, still emit chunk with empty parts for finish_reason / usage
        if parts.is_empty() && chunk.finish_reason.is_none() && chunk.usage.is_none() {
            return Ok(None);
        }

        let role = chunk
            .delta_role
            .as_ref()
            .map(|r| ir_role_to_gemini(r).to_string())
            .or_else(|| Some("model".to_string()));

        let gemini_chunk = GeminiResponse {
            candidates: vec![GeminiCandidate {
                content: GeminiContent { role, parts },
                finish_reason: ir_finish_to_gemini(&chunk.finish_reason),
            }],
            usage_metadata: chunk.usage.as_ref().map(|u| GeminiUsageMetadata {
                prompt_token_count: u.prompt_tokens,
                candidates_token_count: u.completion_tokens,
                total_token_count: u
                    .total_tokens
                    .unwrap_or(u.prompt_tokens + u.completion_tokens),
            }),
        };

        let json = to_json_str(&gemini_chunk)?;

        Ok(Some(json))
    }

    fn stream_done_signal(&mut self) -> Option<String> {
        // Gemini streams end when the connection closes; no explicit done signal.
        None
    }
}
