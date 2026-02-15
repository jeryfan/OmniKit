use serde::{Deserialize, Serialize};

const INDEX_URL: &str = "https://raw.githubusercontent.com/OmniKit/omnikit-rules/main/index.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleIndexEntry {
    pub slug: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub version: String,
    pub tags: Vec<String>,
    pub modality: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleIndex {
    pub rules: Vec<RuleIndexEntry>,
}

/// Fetch the remote rule index. Returns None if fetch fails (offline mode).
pub async fn fetch_index() -> Option<RuleIndex> {
    let client = reqwest::Client::new();
    let resp = client
        .get(INDEX_URL)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .ok()?;
    resp.json::<RuleIndex>().await.ok()
}

/// Fetch a single rule file from the remote repository.
pub async fn fetch_rule(slug: &str) -> Option<serde_json::Value> {
    let url = format!(
        "https://raw.githubusercontent.com/OmniKit/omnikit-rules/main/{}.omnikit.json",
        slug
    );
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .ok()?;
    resp.json::<serde_json::Value>().await.ok()
}
