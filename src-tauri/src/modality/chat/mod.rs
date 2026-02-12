pub mod ir;
pub mod openai_chat;
pub mod anthropic;
pub mod openai_responses;
pub mod gemini;
pub mod moonshot;

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

    /// Return a string identifier for logging/display.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::OpenaiChat => "openai_chat",
            Self::OpenaiResponses => "openai_responses",
            Self::Anthropic => "anthropic",
            Self::Gemini => "gemini",
            Self::Moonshot => "moonshot",
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
        ChatFormat::Moonshot => Box::new(moonshot::MoonshotCodec),
        ChatFormat::Anthropic => Box::new(anthropic::AnthropicCodec),
        ChatFormat::Gemini => Box::new(gemini::GeminiCodec),
        ChatFormat::OpenaiResponses => Box::new(openai_responses::OpenAiResponsesCodec),
    }
}

/// Get an encoder for a given format.
pub fn get_encoder(format: ChatFormat) -> Box<dyn Encoder> {
    match format {
        ChatFormat::OpenaiChat => Box::new(openai_chat::OpenAiChatCodec),
        ChatFormat::Moonshot => Box::new(moonshot::MoonshotCodec),
        ChatFormat::Anthropic => Box::new(anthropic::AnthropicCodec),
        ChatFormat::Gemini => Box::new(gemini::GeminiCodec),
        ChatFormat::OpenaiResponses => Box::new(openai_responses::OpenAiResponsesCodec),
    }
}
