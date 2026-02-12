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
