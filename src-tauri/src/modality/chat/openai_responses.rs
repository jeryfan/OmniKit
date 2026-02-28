use super::helpers::{from_json, from_json_str, to_json, to_json_str};
use super::ir::*;
use super::{Decoder, Encoder};
use crate::error::AppError;
use serde::{Deserialize, Serialize};

pub struct OpenAiResponsesCodec;

// =============================================================================
// Wire Types — Request
// =============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct OaiRespApiRequest {
    pub model: String,
    pub input: OaiRespApiInput,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instructions: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<OaiRespApiTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<serde_json::Value>,
}

/// Input can be a plain string (shorthand for a single user message) or
/// an array of structured input items.
#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum OaiRespApiInput {
    Text(String),
    Items(Vec<OaiRespApiInputItem>),
}

/// A single input item — internally tagged by `type`.
/// We use an untagged enum so that items without `type` (simple messages)
/// also parse correctly, but the canonical form includes a `type` field.
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OaiRespApiInputItem {
    Message {
        role: String,
        content: serde_json::Value,
    },
    FunctionCall {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<String>,
        call_id: String,
        name: String,
        arguments: String,
    },
    FunctionCallOutput {
        call_id: String,
        output: String,
    },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OaiRespApiTool {
    #[serde(rename = "type")]
    pub tool_type: String,
    // Only present for function tools; built-in tools (web_search_preview, file_search, etc.) have no name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<serde_json::Value>,
}

// =============================================================================
// Wire Types — Response
// =============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct OaiRespApiResponse {
    pub id: String,
    pub object: String,
    pub model: String,
    pub output: Vec<OaiRespApiOutputItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<OaiRespApiUsage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OaiRespApiOutputItem {
    Message {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<String>,
        role: String,
        content: Vec<OaiRespApiContentPart>,
    },
    FunctionCall {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<String>,
        call_id: String,
        name: String,
        arguments: String,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OaiRespApiContentPart {
    OutputText {
        text: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        annotations: Option<Vec<serde_json::Value>>,
    },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OaiRespApiUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub total_tokens: u32,
}

// =============================================================================
// Wire Types — Streaming
// =============================================================================

/// A single streaming event from the Responses API.
/// The `type` field determines the event kind.
#[derive(Debug, Serialize, Deserialize)]
pub struct OaiRespApiStreamEvent {
    #[serde(rename = "type")]
    pub event_type: String,

    // Present on response.created / response.completed / response.done
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response: Option<OaiRespApiResponse>,

    // Present on response.output_item.added / response.output_item.done
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item: Option<OaiRespApiOutputItem>,

    // Present on response.content_part.added / response.content_part.done
    #[serde(skip_serializing_if = "Option::is_none")]
    pub part: Option<OaiRespApiContentPart>,

    // Present on response.output_text.delta
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delta: Option<String>,

    // Present on response.output_text.done
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,

    // Index fields for multi-output item / content part correlation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_index: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_index: Option<u32>,

    // Present on response.function_call_arguments.delta
    // (reuses `delta` field above — same JSON key)

    // Present on response.function_call_arguments.done
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments: Option<String>,

    // Sequence number (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sequence_number: Option<u64>,
}

// =============================================================================
// Conversion helpers
// =============================================================================

fn resp_content_to_ir(value: &serde_json::Value) -> IrContent {
    match value {
        serde_json::Value::String(s) => IrContent::Text(s.clone()),
        serde_json::Value::Array(parts) => {
            let ir_parts: Vec<IrContentPart> = parts
                .iter()
                .filter_map(|p| {
                    let t = p.get("type")?.as_str()?;
                    match t {
                        "input_text" | "text" => Some(IrContentPart::Text {
                            text: p.get("text")?.as_str()?.to_string(),
                        }),
                        "input_image" => {
                            let url = p.get("image_url").and_then(|u| u.as_str()).map(String::from);
                            let data = p.get("data").and_then(|d| d.as_str()).map(String::from);
                            let media_type = p.get("media_type").and_then(|m| m.as_str()).map(String::from);
                            Some(IrContentPart::Image {
                                url,
                                media_type,
                                data,
                            })
                        }
                        _ => None,
                    }
                })
                .collect();
            IrContent::Parts(ir_parts)
        }
        serde_json::Value::Null => IrContent::Text(String::new()),
        _ => IrContent::Text(String::new()),
    }
}

fn ir_content_to_resp_input(content: &IrContent) -> serde_json::Value {
    match content {
        IrContent::Text(s) => serde_json::Value::String(s.clone()),
        IrContent::Parts(parts) => {
            let resp_parts: Vec<serde_json::Value> = parts
                .iter()
                .map(|p| match p {
                    IrContentPart::Text { text } => serde_json::json!({
                        "type": "input_text",
                        "text": text,
                    }),
                    IrContentPart::Image { url, media_type, data } => {
                        let mut obj = serde_json::json!({"type": "input_image"});
                        if let Some(u) = url {
                            obj["image_url"] = serde_json::Value::String(u.clone());
                        }
                        if let Some(d) = data {
                            obj["data"] = serde_json::Value::String(d.clone());
                        }
                        if let Some(m) = media_type {
                            obj["media_type"] = serde_json::Value::String(m.clone());
                        }
                        obj
                    }
                })
                .collect();
            serde_json::Value::Array(resp_parts)
        }
    }
}

fn resp_role_to_ir(role: &str) -> IrRole {
    match role {
        "system" => IrRole::System,
        "assistant" => IrRole::Assistant,
        "tool" => IrRole::Tool,
        _ => IrRole::User,
    }
}

fn ir_role_to_resp(role: &IrRole) -> &'static str {
    match role {
        IrRole::System => "system",
        IrRole::User => "user",
        IrRole::Assistant => "assistant",
        IrRole::Tool => "tool",
    }
}

fn resp_status_to_ir_finish(status: &Option<String>) -> Option<IrFinishReason> {
    status.as_ref().map(|s| match s.as_str() {
        "completed" => IrFinishReason::Stop,
        "incomplete" | "cancelled" => IrFinishReason::Length,
        "failed" => IrFinishReason::Stop,
        _ => IrFinishReason::Stop,
    })
}

fn ir_finish_to_resp_status(reason: &Option<IrFinishReason>) -> String {
    match reason {
        Some(IrFinishReason::Length) => "incomplete".to_string(),
        _ => "completed".to_string(),
    }
}

fn has_tool_calls_in_output(output: &[OaiRespApiOutputItem]) -> bool {
    output.iter().any(|item| matches!(item, OaiRespApiOutputItem::FunctionCall { .. }))
}

// =============================================================================
// Decoder
// =============================================================================

impl Decoder for OpenAiResponsesCodec {
    fn decode_request(&self, body: &[u8]) -> Result<IrChatRequest, AppError> {
        // Pre-process: inject `"type": "message"` into input items that lack the
        // field.  The OpenAI Responses API allows bare `{"role","content"}` objects
        // without an explicit type; the internally-tagged serde enum requires it.
        let body: std::borrow::Cow<[u8]> = if let Ok(mut v) =
            serde_json::from_slice::<serde_json::Value>(body)
        {
            let needs_fix = v
                .get("input")
                .and_then(|i| i.as_array())
                .map(|arr| arr.iter().any(|item| {
                    item.is_object() && item.get("type").is_none()
                }))
                .unwrap_or(false);

            if needs_fix {
                if let Some(arr) = v.get_mut("input").and_then(|i| i.as_array_mut()) {
                    for item in arr.iter_mut() {
                        if let Some(obj) = item.as_object_mut() {
                            if !obj.contains_key("type") {
                                obj.insert(
                                    "type".to_string(),
                                    serde_json::Value::String("message".to_string()),
                                );
                            }
                        }
                    }
                }
                std::borrow::Cow::Owned(
                    to_json(&v)?,
                )
            } else {
                std::borrow::Cow::Borrowed(body)
            }
        } else {
            std::borrow::Cow::Borrowed(body)
        };

        let req: OaiRespApiRequest =
            from_json(&body)?;

        let system = req.instructions.clone();

        let mut messages = Vec::new();

        match &req.input {
            OaiRespApiInput::Text(text) => {
                messages.push(IrMessage {
                    role: IrRole::User,
                    content: IrContent::Text(text.clone()),
                    tool_calls: None,
                    tool_call_id: None,
                    name: None,
                });
            }
            OaiRespApiInput::Items(items) => {
                for item in items {
                    match item {
                        OaiRespApiInputItem::Message { role, content } => {
                            messages.push(IrMessage {
                                role: resp_role_to_ir(role),
                                content: resp_content_to_ir(content),
                                tool_calls: None,
                                tool_call_id: None,
                                name: None,
                            });
                        }
                        OaiRespApiInputItem::FunctionCall {
                            id: _,
                            call_id,
                            name,
                            arguments,
                        } => {
                            // A function_call input item represents an assistant tool call.
                            // We create an assistant message with the tool call attached.
                            messages.push(IrMessage {
                                role: IrRole::Assistant,
                                content: IrContent::Text(String::new()),
                                tool_calls: Some(vec![IrToolCall {
                                    id: call_id.clone(),
                                    name: name.clone(),
                                    arguments: arguments.clone(),
                                }]),
                                tool_call_id: None,
                                name: None,
                            });
                        }
                        OaiRespApiInputItem::FunctionCallOutput { call_id, output } => {
                            // A function_call_output item represents a tool result.
                            messages.push(IrMessage {
                                role: IrRole::Tool,
                                content: IrContent::Text(output.clone()),
                                tool_calls: None,
                                tool_call_id: Some(call_id.clone()),
                                name: None,
                            });
                        }
                    }
                }
            }
        }

        let tools = req.tools.map(|ts| {
            ts.into_iter()
                .filter_map(|t| {
                    // Only function tools (with a name) map to IR; skip built-in tools.
                    t.name.map(|name| IrTool {
                        name,
                        description: t.description,
                        parameters: t.parameters.unwrap_or(serde_json::json!({})),
                    })
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
                let name = tc.get("name")?.as_str()?.to_string();
                Some(IrToolChoice::Tool { name })
            }
        });

        Ok(IrChatRequest {
            model: req.model,
            messages,
            system,
            temperature: req.temperature,
            top_p: req.top_p,
            max_tokens: req.max_output_tokens,
            stream: req.stream.unwrap_or(false),
            stop: None,
            tools,
            tool_choice,
            extra: None,
        })
    }

    fn decode_response(&self, body: &[u8]) -> Result<IrChatResponse, AppError> {
        let resp: OaiRespApiResponse =
            from_json(body)?;

        // Collect text content and tool calls from output items.
        let mut text_parts: Vec<String> = Vec::new();
        let mut tool_calls: Vec<IrToolCall> = Vec::new();

        for item in &resp.output {
            match item {
                OaiRespApiOutputItem::Message { content, .. } => {
                    for part in content {
                        match part {
                            OaiRespApiContentPart::OutputText { text, .. } => {
                                text_parts.push(text.clone());
                            }
                        }
                    }
                }
                OaiRespApiOutputItem::FunctionCall {
                    id: _,
                    call_id,
                    name,
                    arguments,
                } => {
                    tool_calls.push(IrToolCall {
                        id: call_id.clone(),
                        name: name.clone(),
                        arguments: arguments.clone(),
                    });
                }
            }
        }

        let content_text = text_parts.join("");
        let finish_reason = if !tool_calls.is_empty() {
            Some(IrFinishReason::ToolCalls)
        } else {
            resp_status_to_ir_finish(&resp.status)
        };

        let ir_msg = IrMessage {
            role: IrRole::Assistant,
            content: IrContent::Text(content_text),
            tool_calls: if tool_calls.is_empty() {
                None
            } else {
                Some(tool_calls)
            },
            tool_call_id: None,
            name: None,
        };

        Ok(IrChatResponse {
            id: resp.id,
            model: resp.model,
            message: ir_msg,
            finish_reason,
            usage: resp.usage.map(|u| IrUsage {
                prompt_tokens: u.input_tokens,
                completion_tokens: u.output_tokens,
                total_tokens: Some(u.total_tokens),
            }),
        })
    }

    fn decode_stream_chunk(&self, data: &str) -> Result<Option<IrStreamChunk>, AppError> {
        if data.trim().is_empty() || self.is_stream_done(data) {
            return Ok(None);
        }

        let event: OaiRespApiStreamEvent =
            from_json_str(data)?;

        match event.event_type.as_str() {
            "response.created" => {
                // Extract id and model from the response object.
                if let Some(resp) = &event.response {
                    return Ok(Some(IrStreamChunk {
                        id: resp.id.clone(),
                        model: Some(resp.model.clone()),
                        delta_role: Some(IrRole::Assistant),
                        delta_content: None,
                        delta_tool_calls: None,
                        finish_reason: None,
                        usage: None,
                    }));
                }
                Ok(None)
            }

            "response.output_text.delta" => {
                // Text delta — the `delta` field contains the text fragment.
                let id = extract_event_id(&event);
                Ok(Some(IrStreamChunk {
                    id,
                    model: None,
                    delta_role: None,
                    delta_content: event.delta,
                    delta_tool_calls: None,
                    finish_reason: None,
                    usage: None,
                }))
            }

            "response.function_call_arguments.delta" => {
                let id = extract_event_id(&event);
                let output_index = event.output_index.unwrap_or(0);
                // Build a tool call delta with the arguments fragment.
                let tc_delta = IrToolCallDelta {
                    index: output_index,
                    id: None,
                    name: None,
                    arguments: event.delta,
                };
                Ok(Some(IrStreamChunk {
                    id,
                    model: None,
                    delta_role: None,
                    delta_content: None,
                    delta_tool_calls: Some(vec![tc_delta]),
                    finish_reason: None,
                    usage: None,
                }))
            }

            "response.output_item.added" => {
                // When a function_call output item is added, emit the tool call id and name.
                let id = extract_event_id(&event);
                if let Some(OaiRespApiOutputItem::FunctionCall {
                    id: _fc_id,
                    call_id,
                    name,
                    ..
                }) = &event.item
                {
                    let output_index = event.output_index.unwrap_or(0);
                    let tc_delta = IrToolCallDelta {
                        index: output_index,
                        id: Some(call_id.clone()),
                        name: Some(name.clone()),
                        arguments: None,
                    };
                    return Ok(Some(IrStreamChunk {
                        id,
                        model: None,
                        delta_role: None,
                        delta_content: None,
                        delta_tool_calls: Some(vec![tc_delta]),
                        finish_reason: None,
                        usage: None,
                    }));
                }
                Ok(None)
            }

            "response.completed" => {
                // Final event with usage information.
                if let Some(resp) = &event.response {
                    let finish_reason = if has_tool_calls_in_output(&resp.output) {
                        Some(IrFinishReason::ToolCalls)
                    } else {
                        resp_status_to_ir_finish(&resp.status)
                    };
                    return Ok(Some(IrStreamChunk {
                        id: resp.id.clone(),
                        model: Some(resp.model.clone()),
                        delta_role: None,
                        delta_content: None,
                        delta_tool_calls: None,
                        finish_reason,
                        usage: resp.usage.as_ref().map(|u| IrUsage {
                            prompt_tokens: u.input_tokens,
                            completion_tokens: u.output_tokens,
                            total_tokens: Some(u.total_tokens),
                        }),
                    }));
                }
                Ok(None)
            }

            // Events we consume but produce no IR chunk for:
            // response.output_item.done, response.content_part.added,
            // response.content_part.done, response.output_text.done,
            // response.function_call_arguments.done, response.done
            _ => Ok(None),
        }
    }

    fn is_stream_done(&self, data: &str) -> bool {
        // The Responses API uses typed events; the terminal signal is
        // the `response.done` event type (or `response.completed`).
        // We check for both the event type in JSON and the plain [DONE] sentinel
        // that some proxy layers may inject.
        let trimmed = data.trim();
        if trimmed == "[DONE]" {
            return true;
        }
        // Quick check without full parse.
        if trimmed.contains("\"response.done\"") || trimmed.contains("\"response.completed\"") {
            // Try to confirm by parsing.
            if let Ok(evt) = serde_json::from_str::<OaiRespApiStreamEvent>(trimmed) {
                return evt.event_type == "response.done";
            }
        }
        false
    }
}

/// Extract a response id from the event.
/// Falls back to an empty string (streaming events before response.created
/// may not carry the response id directly).
fn extract_event_id(event: &OaiRespApiStreamEvent) -> String {
    event
        .response
        .as_ref()
        .map(|r| r.id.clone())
        .unwrap_or_default()
}

// =============================================================================
// Encoder
// =============================================================================

/// Stateless encoder for non-streaming encode operations (request / response).
/// Also used directly by `OpenAiResponsesEncoder` via delegation.
impl OpenAiResponsesCodec {
    fn encode_request_inner(ir: &IrChatRequest, model: &str) -> Result<Vec<u8>, AppError> {
        let instructions = ir.system.clone();

        let mut items: Vec<OaiRespApiInputItem> = Vec::new();

        for msg in &ir.messages {
            match msg.role {
                IrRole::System => {
                    // System messages inside the messages list are promoted
                    // to `instructions` at the top level; skip here because
                    // we already set `instructions` from ir.system.
                    // If for some reason a system message exists in the list,
                    // encode it as a regular message item (the API accepts it).
                    items.push(OaiRespApiInputItem::Message {
                        role: "user".to_string(),
                        content: ir_content_to_resp_input(&msg.content),
                    });
                }
                IrRole::User | IrRole::Assistant => {
                    // If this is an assistant message with tool calls, emit
                    // individual function_call items instead.
                    if let Some(tcs) = &msg.tool_calls {
                        for tc in tcs {
                            items.push(OaiRespApiInputItem::FunctionCall {
                                id: None,
                                call_id: tc.id.clone(),
                                name: tc.name.clone(),
                                arguments: tc.arguments.clone(),
                            });
                        }
                    } else {
                        items.push(OaiRespApiInputItem::Message {
                            role: ir_role_to_resp(&msg.role).to_string(),
                            content: ir_content_to_resp_input(&msg.content),
                        });
                    }
                }
                IrRole::Tool => {
                    // Tool result → function_call_output.
                    let call_id = msg.tool_call_id.clone().unwrap_or_default();
                    items.push(OaiRespApiInputItem::FunctionCallOutput {
                        call_id,
                        output: msg.content.to_text(),
                    });
                }
            }
        }

        let tools = ir.tools.as_ref().map(|ts| {
            ts.iter()
                .map(|t| OaiRespApiTool {
                    tool_type: "function".to_string(),
                    name: Some(t.name.clone()),
                    description: t.description.clone(),
                    parameters: Some(t.parameters.clone()),
                })
                .collect()
        });

        let tool_choice = ir.tool_choice.as_ref().map(|tc| match tc {
            IrToolChoice::Auto => serde_json::json!("auto"),
            IrToolChoice::None => serde_json::json!("none"),
            IrToolChoice::Any => serde_json::json!("required"),
            IrToolChoice::Tool { name } => serde_json::json!({
                "type": "function",
                "name": name,
            }),
        });

        let req = OaiRespApiRequest {
            model: model.to_string(),
            input: OaiRespApiInput::Items(items),
            instructions,
            temperature: ir.temperature,
            top_p: ir.top_p,
            max_output_tokens: ir.max_tokens,
            stream: if ir.stream { Some(true) } else { None },
            tools,
            tool_choice,
        };

        to_json(&req)
    }

    fn encode_response_inner(ir: &IrChatResponse) -> Result<Vec<u8>, AppError> {
        let mut output: Vec<OaiRespApiOutputItem> = Vec::new();

        // If there is text content, add a message output item.
        let text = ir.message.content.to_text();
        if !text.is_empty() {
            output.push(OaiRespApiOutputItem::Message {
                id: Some(format!("msg_{}", &ir.id)),
                role: "assistant".to_string(),
                content: vec![OaiRespApiContentPart::OutputText {
                    text,
                    annotations: Some(vec![]),
                }],
            });
        }

        // If there are tool calls, add function_call output items.
        if let Some(tcs) = &ir.message.tool_calls {
            for tc in tcs {
                output.push(OaiRespApiOutputItem::FunctionCall {
                    id: Some(format!("fc_{}", tc.id)),
                    call_id: tc.id.clone(),
                    name: tc.name.clone(),
                    arguments: tc.arguments.clone(),
                });
            }
        }

        let status = ir_finish_to_resp_status(&ir.finish_reason);

        let usage = ir.usage.as_ref().map(|u| OaiRespApiUsage {
            input_tokens: u.prompt_tokens,
            output_tokens: u.completion_tokens,
            total_tokens: u.total_tokens.unwrap_or(u.prompt_tokens + u.completion_tokens),
        });

        let resp = OaiRespApiResponse {
            id: ir.id.clone(),
            object: "response".to_string(),
            model: ir.model.clone(),
            output,
            usage,
            status: Some(status),
        };

        to_json(&resp)
    }

}

// =============================================================================
// OpenAiResponsesEncoder — stateful streaming encoder
// =============================================================================

/// Stateful encoder for OpenAI Responses API streaming output.
///
/// Accumulates state (id, model, finish_reason, usage, accumulated text, tool
/// call indices) across `encode_stream_chunk` calls so that `stream_done_signal`
/// can emit the complete sequence of closing events:
///
///   response.output_text.done → response.content_part.done →
///   response.output_item.done → response.completed
///
/// `response.completed` is ONLY emitted from `stream_done_signal`, never from
/// `encode_stream_chunk`.  This prevents clients (e.g. Codex) from closing the
/// connection mid-stream when they see `response.completed`, which would drop
/// the stream generator before the log can be saved to the database.
pub struct OpenAiResponsesEncoder {
    response_id: String,
    model: String,
    finish_reason: Option<IrFinishReason>,
    usage: Option<IrUsage>,
    accumulated_text: String,
    preamble_sent: bool,
    /// output_index values for each tool call that was started, in order.
    tool_call_output_indices: Vec<u32>,
}

impl OpenAiResponsesEncoder {
    pub fn new() -> Self {
        Self {
            response_id: String::new(),
            model: String::new(),
            finish_reason: None,
            usage: None,
            accumulated_text: String::new(),
            preamble_sent: false,
            tool_call_output_indices: Vec::new(),
        }
    }
}

impl Encoder for OpenAiResponsesEncoder {
    fn encode_request(&self, ir: &IrChatRequest, model: &str) -> Result<Vec<u8>, AppError> {
        OpenAiResponsesCodec::encode_request_inner(ir, model)
    }

    fn encode_response(&self, ir: &IrChatResponse) -> Result<Vec<u8>, AppError> {
        OpenAiResponsesCodec::encode_response_inner(ir)
    }

    fn encode_stream_chunk(&mut self, chunk: &IrStreamChunk) -> Result<Option<String>, AppError> {
        let mut events: Vec<String> = Vec::new();

        // Persist id and model from every chunk that carries them.
        if !chunk.id.is_empty() {
            self.response_id = chunk.id.clone();
        }
        if let Some(m) = &chunk.model {
            if self.model.is_empty() {
                self.model = m.clone();
            }
        }

        // Accumulate finish_reason and usage — do NOT emit response.completed here.
        if let Some(fr) = &chunk.finish_reason {
            self.finish_reason = Some(fr.clone());
        }
        if let Some(u) = &chunk.usage {
            self.usage = Some(u.clone());
        }

        // First chunk that carries a role: emit preamble events.
        if chunk.delta_role.is_some() && !self.preamble_sent {
            self.preamble_sent = true;

            let created = OaiRespApiStreamEvent {
                event_type: "response.created".to_string(),
                response: Some(OaiRespApiResponse {
                    id: self.response_id.clone(),
                    object: "response".to_string(),
                    model: self.model.clone(),
                    output: vec![],
                    usage: None,
                    status: Some("in_progress".to_string()),
                }),
                item: None,
                part: None,
                delta: None,
                text: None,
                output_index: None,
                content_index: None,
                arguments: None,
                sequence_number: None,
            };
            events.push(to_json_str(&created)?);

            let item_added = OaiRespApiStreamEvent {
                event_type: "response.output_item.added".to_string(),
                response: None,
                item: Some(OaiRespApiOutputItem::Message {
                    id: Some(format!("msg_{}", self.response_id)),
                    role: "assistant".to_string(),
                    content: vec![],
                }),
                part: None,
                delta: None,
                text: None,
                output_index: Some(0),
                content_index: None,
                arguments: None,
                sequence_number: None,
            };
            events.push(to_json_str(&item_added)?);

            let part_added = OaiRespApiStreamEvent {
                event_type: "response.content_part.added".to_string(),
                response: None,
                item: None,
                part: Some(OaiRespApiContentPart::OutputText {
                    text: String::new(),
                    annotations: Some(vec![]),
                }),
                delta: None,
                text: None,
                output_index: Some(0),
                content_index: Some(0),
                arguments: None,
                sequence_number: None,
            };
            events.push(to_json_str(&part_added)?);
        }

        // Text delta.
        if let Some(delta_text) = &chunk.delta_content {
            self.accumulated_text.push_str(delta_text);

            let text_delta = OaiRespApiStreamEvent {
                event_type: "response.output_text.delta".to_string(),
                response: None,
                item: None,
                part: None,
                delta: Some(delta_text.clone()),
                text: None,
                output_index: Some(0),
                content_index: Some(0),
                arguments: None,
                sequence_number: None,
            };
            events.push(to_json_str(&text_delta)?);
        }

        // Tool call deltas.
        if let Some(tc_deltas) = &chunk.delta_tool_calls {
            for tc in tc_deltas {
                // New tool call: emit output_item.added and record the index.
                if tc.id.is_some() && tc.name.is_some() {
                    self.tool_call_output_indices.push(tc.index);

                    let fc_item = OaiRespApiOutputItem::FunctionCall {
                        id: tc.id.as_ref().map(|id| format!("fc_{}", id)),
                        call_id: tc.id.clone().unwrap_or_default(),
                        name: tc.name.clone().unwrap_or_default(),
                        arguments: String::new(),
                    };
                    let item_added = OaiRespApiStreamEvent {
                        event_type: "response.output_item.added".to_string(),
                        response: None,
                        item: Some(fc_item),
                        part: None,
                        delta: None,
                        text: None,
                        output_index: Some(tc.index),
                        content_index: None,
                        arguments: None,
                        sequence_number: None,
                    };
                    events.push(to_json_str(&item_added)?);
                }

                // Argument delta.
                if let Some(args) = &tc.arguments {
                    let args_delta = OaiRespApiStreamEvent {
                        event_type: "response.function_call_arguments.delta".to_string(),
                        response: None,
                        item: None,
                        part: None,
                        delta: Some(args.clone()),
                        text: None,
                        output_index: Some(tc.index),
                        content_index: None,
                        arguments: None,
                        sequence_number: None,
                    };
                    events.push(to_json_str(&args_delta)?);
                }
            }
        }

        // NOTE: finish_reason and usage are saved to state above.
        // response.completed is intentionally NOT emitted here — it is only
        // emitted from stream_done_signal(), after the upstream [DONE] is received.

        if events.is_empty() {
            Ok(None)
        } else {
            Ok(Some(events.join("\n")))
        }
    }

    fn stream_done_signal(&mut self) -> Option<String> {
        // Emit the sequence of closing events required by the Responses API spec:
        //   response.output_text.done
        //   response.content_part.done
        //   response.output_item.done        (for the message item)
        //   response.output_item.done        (for each tool call, if any)
        //   response.completed
        //
        // This is called exactly once, after the upstream stream ends ([DONE]).
        // By emitting response.completed only here — after the DB log has been
        // saved in proxy.rs — we avoid the race condition where the client closes
        // the connection upon seeing response.completed, dropping the generator
        // before the log can be persisted.

        let mut events: Vec<String> = Vec::new();

        let has_text = !self.accumulated_text.is_empty();
        let has_tool_calls = !self.tool_call_output_indices.is_empty();

        if has_text {
            let text_done = OaiRespApiStreamEvent {
                event_type: "response.output_text.done".to_string(),
                response: None,
                item: None,
                part: None,
                delta: None,
                text: Some(self.accumulated_text.clone()),
                output_index: Some(0),
                content_index: Some(0),
                arguments: None,
                sequence_number: None,
            };
            if let Ok(s) = serde_json::to_string(&text_done) { events.push(s); }

            let part_done = OaiRespApiStreamEvent {
                event_type: "response.content_part.done".to_string(),
                response: None,
                item: None,
                part: Some(OaiRespApiContentPart::OutputText {
                    text: self.accumulated_text.clone(),
                    annotations: Some(vec![]),
                }),
                delta: None,
                text: None,
                output_index: Some(0),
                content_index: Some(0),
                arguments: None,
                sequence_number: None,
            };
            if let Ok(s) = serde_json::to_string(&part_done) { events.push(s); }

            let item_done = OaiRespApiStreamEvent {
                event_type: "response.output_item.done".to_string(),
                response: None,
                item: Some(OaiRespApiOutputItem::Message {
                    id: Some(format!("msg_{}", self.response_id)),
                    role: "assistant".to_string(),
                    content: vec![OaiRespApiContentPart::OutputText {
                        text: self.accumulated_text.clone(),
                        annotations: Some(vec![]),
                    }],
                }),
                part: None,
                delta: None,
                text: None,
                output_index: Some(0),
                content_index: None,
                arguments: None,
                sequence_number: None,
            };
            if let Ok(s) = serde_json::to_string(&item_done) { events.push(s); }
        }

        // Tool call output_item.done events.
        if has_tool_calls {
            for &idx in &self.tool_call_output_indices {
                let item_done = OaiRespApiStreamEvent {
                    event_type: "response.output_item.done".to_string(),
                    response: None,
                    item: Some(OaiRespApiOutputItem::FunctionCall {
                        id: None,
                        call_id: String::new(),
                        name: String::new(),
                        arguments: String::new(),
                    }),
                    part: None,
                    delta: None,
                    text: None,
                    output_index: Some(idx),
                    content_index: None,
                    arguments: None,
                    sequence_number: None,
                };
                if let Ok(s) = serde_json::to_string(&item_done) { events.push(s); }
            }
        }

        // response.completed — the terminal event that signals stream end.
        let finish_reason = self.finish_reason.take();
        let usage = self.usage.take();
        let status = ir_finish_to_resp_status(&finish_reason);

        let completed = OaiRespApiStreamEvent {
            event_type: "response.completed".to_string(),
            response: Some(OaiRespApiResponse {
                id: self.response_id.clone(),
                object: "response".to_string(),
                model: self.model.clone(),
                output: vec![],
                usage: usage.map(|u| OaiRespApiUsage {
                    input_tokens: u.prompt_tokens,
                    output_tokens: u.completion_tokens,
                    total_tokens: u.total_tokens.unwrap_or(u.prompt_tokens + u.completion_tokens),
                }),
                status: Some(status),
            }),
            item: None,
            part: None,
            delta: None,
            text: None,
            output_index: None,
            content_index: None,
            arguments: None,
            sequence_number: None,
        };
        if let Ok(s) = serde_json::to_string(&completed) { events.push(s); }

        if events.is_empty() {
            None
        } else {
            Some(events.join("\n"))
        }
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_request_string_input() {
        let body = serde_json::json!({
            "model": "gpt-4o",
            "input": "Hello, world!",
            "temperature": 0.7,
            "max_output_tokens": 1024
        });
        let codec = OpenAiResponsesCodec;
        let ir = codec
            .decode_request(serde_json::to_vec(&body).unwrap().as_slice())
            .unwrap();

        assert_eq!(ir.model, "gpt-4o");
        assert_eq!(ir.messages.len(), 1);
        assert_eq!(ir.messages[0].role, IrRole::User);
        assert_eq!(ir.messages[0].content.to_text(), "Hello, world!");
        assert_eq!(ir.temperature, Some(0.7));
        assert_eq!(ir.max_tokens, Some(1024));
        assert!(ir.system.is_none());
    }

    #[test]
    fn decode_request_with_instructions_and_items() {
        let body = serde_json::json!({
            "model": "gpt-4o",
            "instructions": "You are a helpful assistant.",
            "input": [
                {"type": "message", "role": "user", "content": "Hi"},
                {"type": "message", "role": "assistant", "content": "Hello!"},
                {"type": "message", "role": "user", "content": "What is 2+2?"}
            ],
            "stream": true
        });
        let codec = OpenAiResponsesCodec;
        let ir = codec
            .decode_request(serde_json::to_vec(&body).unwrap().as_slice())
            .unwrap();

        assert_eq!(ir.system, Some("You are a helpful assistant.".to_string()));
        assert_eq!(ir.messages.len(), 3);
        assert_eq!(ir.messages[0].role, IrRole::User);
        assert_eq!(ir.messages[1].role, IrRole::Assistant);
        assert_eq!(ir.messages[2].role, IrRole::User);
        assert!(ir.stream);
    }

    #[test]
    fn decode_request_with_function_call_items() {
        let body = serde_json::json!({
            "model": "gpt-4o",
            "input": [
                {"type": "message", "role": "user", "content": "What is the weather?"},
                {"type": "function_call", "id": "fc_1", "call_id": "call_1", "name": "get_weather", "arguments": "{\"location\":\"NYC\"}"},
                {"type": "function_call_output", "call_id": "call_1", "output": "sunny, 72F"}
            ]
        });
        let codec = OpenAiResponsesCodec;
        let ir = codec
            .decode_request(serde_json::to_vec(&body).unwrap().as_slice())
            .unwrap();

        assert_eq!(ir.messages.len(), 3);
        // First: user message
        assert_eq!(ir.messages[0].role, IrRole::User);
        // Second: assistant with tool call
        assert_eq!(ir.messages[1].role, IrRole::Assistant);
        let tc = ir.messages[1].tool_calls.as_ref().unwrap();
        assert_eq!(tc.len(), 1);
        assert_eq!(tc[0].id, "call_1");
        assert_eq!(tc[0].name, "get_weather");
        // Third: tool result
        assert_eq!(ir.messages[2].role, IrRole::Tool);
        assert_eq!(ir.messages[2].tool_call_id, Some("call_1".to_string()));
        assert_eq!(ir.messages[2].content.to_text(), "sunny, 72F");
    }

    #[test]
    fn decode_request_with_tools() {
        let body = serde_json::json!({
            "model": "gpt-4o",
            "input": "Use a tool",
            "tools": [
                {
                    "type": "function",
                    "name": "get_weather",
                    "description": "Get weather",
                    "parameters": {"type": "object", "properties": {"location": {"type": "string"}}}
                }
            ],
            "tool_choice": "auto"
        });
        let codec = OpenAiResponsesCodec;
        let ir = codec
            .decode_request(serde_json::to_vec(&body).unwrap().as_slice())
            .unwrap();

        let tools = ir.tools.unwrap();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].name, "get_weather");
        assert!(matches!(ir.tool_choice, Some(IrToolChoice::Auto)));
    }

    #[test]
    fn decode_response_text_only() {
        let body = serde_json::json!({
            "id": "resp_001",
            "object": "response",
            "model": "gpt-4o",
            "output": [
                {
                    "type": "message",
                    "id": "msg_001",
                    "role": "assistant",
                    "content": [
                        {"type": "output_text", "text": "Hello!", "annotations": []}
                    ]
                }
            ],
            "usage": {
                "input_tokens": 10,
                "output_tokens": 5,
                "total_tokens": 15
            },
            "status": "completed"
        });
        let codec = OpenAiResponsesCodec;
        let ir = codec
            .decode_response(serde_json::to_vec(&body).unwrap().as_slice())
            .unwrap();

        assert_eq!(ir.id, "resp_001");
        assert_eq!(ir.model, "gpt-4o");
        assert_eq!(ir.message.content.to_text(), "Hello!");
        assert!(ir.message.tool_calls.is_none());
        assert_eq!(ir.finish_reason, Some(IrFinishReason::Stop));
        let usage = ir.usage.unwrap();
        assert_eq!(usage.prompt_tokens, 10);
        assert_eq!(usage.completion_tokens, 5);
    }

    #[test]
    fn decode_response_with_tool_calls() {
        let body = serde_json::json!({
            "id": "resp_002",
            "object": "response",
            "model": "gpt-4o",
            "output": [
                {
                    "type": "function_call",
                    "id": "fc_1",
                    "call_id": "call_1",
                    "name": "get_weather",
                    "arguments": "{\"location\":\"NYC\"}"
                }
            ],
            "usage": {
                "input_tokens": 20,
                "output_tokens": 15,
                "total_tokens": 35
            },
            "status": "completed"
        });
        let codec = OpenAiResponsesCodec;
        let ir = codec
            .decode_response(serde_json::to_vec(&body).unwrap().as_slice())
            .unwrap();

        assert_eq!(ir.finish_reason, Some(IrFinishReason::ToolCalls));
        let tcs = ir.message.tool_calls.unwrap();
        assert_eq!(tcs.len(), 1);
        assert_eq!(tcs[0].id, "call_1");
        assert_eq!(tcs[0].name, "get_weather");
    }

    #[test]
    fn encode_request_basic() {
        let ir = IrChatRequest {
            model: "gpt-4o".to_string(),
            messages: vec![IrMessage {
                role: IrRole::User,
                content: IrContent::Text("Hello".to_string()),
                tool_calls: None,
                tool_call_id: None,
                name: None,
            }],
            system: Some("Be helpful".to_string()),
            temperature: Some(0.5),
            top_p: None,
            max_tokens: Some(512),
            stream: false,
            stop: None,
            tools: None,
            tool_choice: None,
            extra: None,
        };
        let mut codec = OpenAiResponsesEncoder::new();
        let bytes = codec.encode_request(&ir, "gpt-4o-mini").unwrap();
        let req: OaiRespApiRequest = serde_json::from_slice(&bytes).unwrap();

        assert_eq!(req.model, "gpt-4o-mini");
        assert_eq!(req.instructions, Some("Be helpful".to_string()));
        assert_eq!(req.max_output_tokens, Some(512));
        assert_eq!(req.temperature, Some(0.5));
        assert!(req.stream.is_none());

        if let OaiRespApiInput::Items(items) = &req.input {
            assert_eq!(items.len(), 1);
        } else {
            panic!("Expected Items input");
        }
    }

    #[test]
    fn encode_request_with_tool_messages() {
        let ir = IrChatRequest {
            model: "gpt-4o".to_string(),
            messages: vec![
                IrMessage {
                    role: IrRole::User,
                    content: IrContent::Text("Weather?".to_string()),
                    tool_calls: None,
                    tool_call_id: None,
                    name: None,
                },
                IrMessage {
                    role: IrRole::Assistant,
                    content: IrContent::Text(String::new()),
                    tool_calls: Some(vec![IrToolCall {
                        id: "call_1".to_string(),
                        name: "get_weather".to_string(),
                        arguments: "{\"location\":\"NYC\"}".to_string(),
                    }]),
                    tool_call_id: None,
                    name: None,
                },
                IrMessage {
                    role: IrRole::Tool,
                    content: IrContent::Text("sunny".to_string()),
                    tool_calls: None,
                    tool_call_id: Some("call_1".to_string()),
                    name: None,
                },
            ],
            system: None,
            temperature: None,
            top_p: None,
            max_tokens: None,
            stream: false,
            stop: None,
            tools: None,
            tool_choice: None,
            extra: None,
        };
        let mut codec = OpenAiResponsesEncoder::new();
        let bytes = codec.encode_request(&ir, "gpt-4o").unwrap();
        let req: OaiRespApiRequest = serde_json::from_slice(&bytes).unwrap();

        if let OaiRespApiInput::Items(items) = &req.input {
            assert_eq!(items.len(), 3);
            // User message
            assert!(matches!(&items[0], OaiRespApiInputItem::Message { role, .. } if role == "user"));
            // Function call
            assert!(matches!(&items[1], OaiRespApiInputItem::FunctionCall { call_id, name, .. }
                if call_id == "call_1" && name == "get_weather"));
            // Function call output
            assert!(matches!(&items[2], OaiRespApiInputItem::FunctionCallOutput { call_id, output }
                if call_id == "call_1" && output == "sunny"));
        } else {
            panic!("Expected Items input");
        }
    }

    #[test]
    fn encode_response_text() {
        let ir = IrChatResponse {
            id: "resp_123".to_string(),
            model: "gpt-4o".to_string(),
            message: IrMessage {
                role: IrRole::Assistant,
                content: IrContent::Text("Hello there!".to_string()),
                tool_calls: None,
                tool_call_id: None,
                name: None,
            },
            finish_reason: Some(IrFinishReason::Stop),
            usage: Some(IrUsage {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: Some(15),
            }),
        };
        let bytes = OpenAiResponsesCodec::encode_response_inner(&ir).unwrap();
        let resp: OaiRespApiResponse = serde_json::from_slice(&bytes).unwrap();

        assert_eq!(resp.id, "resp_123");
        assert_eq!(resp.object, "response");
        assert_eq!(resp.status, Some("completed".to_string()));
        assert_eq!(resp.output.len(), 1);
        if let OaiRespApiOutputItem::Message { content, role, .. } = &resp.output[0] {
            assert_eq!(role, "assistant");
            assert_eq!(content.len(), 1);
            if let OaiRespApiContentPart::OutputText { text, .. } = &content[0] {
                assert_eq!(text, "Hello there!");
            }
        } else {
            panic!("Expected Message output");
        }
    }

    #[test]
    fn encode_response_with_tool_calls() {
        let ir = IrChatResponse {
            id: "resp_456".to_string(),
            model: "gpt-4o".to_string(),
            message: IrMessage {
                role: IrRole::Assistant,
                content: IrContent::Text(String::new()),
                tool_calls: Some(vec![IrToolCall {
                    id: "call_1".to_string(),
                    name: "search".to_string(),
                    arguments: "{\"q\":\"rust\"}".to_string(),
                }]),
                tool_call_id: None,
                name: None,
            },
            finish_reason: Some(IrFinishReason::ToolCalls),
            usage: None,
        };
        let bytes = OpenAiResponsesCodec::encode_response_inner(&ir).unwrap();
        let resp: OaiRespApiResponse = serde_json::from_slice(&bytes).unwrap();

        // Empty text should not produce a message output item.
        assert_eq!(resp.output.len(), 1);
        if let OaiRespApiOutputItem::FunctionCall {
            call_id, name, arguments, ..
        } = &resp.output[0]
        {
            assert_eq!(call_id, "call_1");
            assert_eq!(name, "search");
            assert_eq!(arguments, "{\"q\":\"rust\"}");
        } else {
            panic!("Expected FunctionCall output");
        }
    }

    #[test]
    fn decode_stream_text_delta() {
        let data = serde_json::json!({
            "type": "response.output_text.delta",
            "delta": "Hello",
            "output_index": 0,
            "content_index": 0
        });
        let codec = OpenAiResponsesCodec;
        let chunk = codec
            .decode_stream_chunk(&serde_json::to_string(&data).unwrap())
            .unwrap()
            .unwrap();

        assert_eq!(chunk.delta_content, Some("Hello".to_string()));
        assert!(chunk.delta_tool_calls.is_none());
    }

    #[test]
    fn decode_stream_function_call_args_delta() {
        let data = serde_json::json!({
            "type": "response.function_call_arguments.delta",
            "delta": "{\"loc",
            "output_index": 1
        });
        let codec = OpenAiResponsesCodec;
        let chunk = codec
            .decode_stream_chunk(&serde_json::to_string(&data).unwrap())
            .unwrap()
            .unwrap();

        assert!(chunk.delta_content.is_none());
        let tcs = chunk.delta_tool_calls.unwrap();
        assert_eq!(tcs.len(), 1);
        assert_eq!(tcs[0].index, 1);
        assert_eq!(tcs[0].arguments, Some("{\"loc".to_string()));
    }

    #[test]
    fn decode_stream_completed() {
        let data = serde_json::json!({
            "type": "response.completed",
            "response": {
                "id": "resp_001",
                "object": "response",
                "model": "gpt-4o",
                "output": [],
                "usage": {
                    "input_tokens": 10,
                    "output_tokens": 20,
                    "total_tokens": 30
                },
                "status": "completed"
            }
        });
        let codec = OpenAiResponsesCodec;
        let chunk = codec
            .decode_stream_chunk(&serde_json::to_string(&data).unwrap())
            .unwrap()
            .unwrap();

        assert_eq!(chunk.id, "resp_001");
        assert_eq!(chunk.model, Some("gpt-4o".to_string()));
        let usage = chunk.usage.unwrap();
        assert_eq!(usage.prompt_tokens, 10);
        assert_eq!(usage.completion_tokens, 20);
    }

    #[test]
    fn is_stream_done_checks() {
        let codec = OpenAiResponsesCodec;
        assert!(codec.is_stream_done("[DONE]"));
        let done_event = serde_json::json!({"type": "response.done"});
        assert!(codec.is_stream_done(&serde_json::to_string(&done_event).unwrap()));
        assert!(!codec.is_stream_done("{\"type\":\"response.output_text.delta\",\"delta\":\"hi\"}"));
    }

    #[test]
    fn encode_stream_chunk_text_delta() {
        let chunk = IrStreamChunk {
            id: "resp_001".to_string(),
            model: None,
            delta_role: None,
            delta_content: Some("world".to_string()),
            delta_tool_calls: None,
            finish_reason: None,
            usage: None,
        };
        let mut enc = OpenAiResponsesEncoder::new();
        let result = enc.encode_stream_chunk(&chunk).unwrap().unwrap();

        let event: OaiRespApiStreamEvent = serde_json::from_str(&result).unwrap();
        assert_eq!(event.event_type, "response.output_text.delta");
        assert_eq!(event.delta, Some("world".to_string()));
    }

    #[test]
    fn encode_stream_chunk_initial() {
        let chunk = IrStreamChunk {
            id: "resp_001".to_string(),
            model: Some("gpt-4o".to_string()),
            delta_role: Some(IrRole::Assistant),
            delta_content: None,
            delta_tool_calls: None,
            finish_reason: None,
            usage: None,
        };
        let mut enc = OpenAiResponsesEncoder::new();
        let result = enc.encode_stream_chunk(&chunk).unwrap().unwrap();

        // Should contain multiple events separated by newlines.
        let lines: Vec<&str> = result.split('\n').collect();
        assert!(lines.len() >= 3); // created, output_item.added, content_part.added

        let first: OaiRespApiStreamEvent = serde_json::from_str(lines[0]).unwrap();
        assert_eq!(first.event_type, "response.created");
    }

    #[test]
    fn stream_done_signal_emits_completed() {
        // stream_done_signal must emit response.completed (not response.done).
        // response.completed is the official terminal event in the Responses API spec.
        let mut enc = OpenAiResponsesEncoder::new();
        enc.response_id = "resp_001".to_string();
        enc.model = "gpt-4o".to_string();
        let signal = enc.stream_done_signal().unwrap();
        // The signal may contain multiple events joined by '\n'.
        // The last event must be response.completed.
        let last_line = signal.split('\n').last().unwrap();
        let event: OaiRespApiStreamEvent = serde_json::from_str(last_line).unwrap();
        assert_eq!(event.event_type, "response.completed");
    }

    #[test]
    fn roundtrip_request() {
        let ir = IrChatRequest {
            model: "gpt-4o".to_string(),
            messages: vec![
                IrMessage {
                    role: IrRole::User,
                    content: IrContent::Text("Hello".to_string()),
                    tool_calls: None,
                    tool_call_id: None,
                    name: None,
                },
            ],
            system: Some("Be helpful".to_string()),
            temperature: Some(0.7),
            top_p: Some(1.0),
            max_tokens: Some(1024),
            stream: false,
            stop: None,
            tools: None,
            tool_choice: None,
            extra: None,
        };

        let encoded = OpenAiResponsesCodec::encode_request_inner(&ir, "gpt-4o").unwrap();
        let decoded = OpenAiResponsesCodec.decode_request(&encoded).unwrap();

        assert_eq!(decoded.model, "gpt-4o");
        assert_eq!(decoded.system, Some("Be helpful".to_string()));
        assert_eq!(decoded.temperature, Some(0.7));
        assert_eq!(decoded.max_tokens, Some(1024));
        assert_eq!(decoded.messages.len(), 1);
        assert_eq!(decoded.messages[0].content.to_text(), "Hello");
    }

    #[test]
    fn roundtrip_response() {
        let ir = IrChatResponse {
            id: "resp_rt".to_string(),
            model: "gpt-4o".to_string(),
            message: IrMessage {
                role: IrRole::Assistant,
                content: IrContent::Text("Test response".to_string()),
                tool_calls: None,
                tool_call_id: None,
                name: None,
            },
            finish_reason: Some(IrFinishReason::Stop),
            usage: Some(IrUsage {
                prompt_tokens: 5,
                completion_tokens: 10,
                total_tokens: Some(15),
            }),
        };

        let encoded = OpenAiResponsesCodec::encode_response_inner(&ir).unwrap();
        let decoded = OpenAiResponsesCodec.decode_response(&encoded).unwrap();

        assert_eq!(decoded.id, "resp_rt");
        assert_eq!(decoded.model, "gpt-4o");
        assert_eq!(decoded.message.content.to_text(), "Test response");
        assert_eq!(decoded.finish_reason, Some(IrFinishReason::Stop));
        let usage = decoded.usage.unwrap();
        assert_eq!(usage.prompt_tokens, 5);
        assert_eq!(usage.completion_tokens, 10);
    }
}
