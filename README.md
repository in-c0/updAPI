
# UpdAPI 🔧

### "Update your knowledge base with the latest **API** resources"
### A free, lightweight tool to streamline the discovery of API documentation, policies, and community resources and enhancing LLMs with accurate, relevant context

 ![updAPI](https://github.com/user-attachments/assets/7a67269e-5ce0-480d-95d8-cd7dfe79ca87)

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)  
[![Contributions Welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg?style=flat)](#contributing)  
[![Build Status](https://img.shields.io/badge/status-under_construction-orange.svg)](#status)  
[![Open Issues](https://img.shields.io/github/issues/in-c0/updapi)](https://github.com/in-c0/updapi/issues)  

---
> Like the project? Please give it a Star so it can reach more people >>>>> [![Star on GitHub](https://img.shields.io/badge/⭐-Star_on_GitHub-blue?style=flat)](https://github.com/UpdAPI/updAPI/stargazers)


> ⚠️ **Under Construction**  
> This project is in the early stages of development and may not function as intended yet. Contributions, feedback, and ideas are highly welcome!

## 📋 Links to Public API DOCS

`api-docs-urls.csv` contains a **centralized collection of popular APIs** with **links to their official documentation and associated policies**. It includes tools to scrape, preprocess, and update the dataset for better usability and retrieval.

api-docs-urls.csv:

| API Name              | Official Documentation URL                           | Privacy Policy URL                 | Terms of Service URL         | Rate Limiting Policy URL               | Changelog/Release Notes URL             | Security Policy URL               | Developer Community/Forum URL           |
|-----------------------|-----------------------------------------------------|------------------------------------|-------------------------------|----------------------------------------|------------------------------------------|-----------------------------------|------------------------------------------|
| OpenAI API           | [Documentation](https://platform.openai.com/docs)   | [Privacy](https://openai.com/privacy) | [Terms](https://openai.com/terms) | [Rate Limits](https://platform.openai.com/docs/guides/rate-limits) | [Changelog](https://platform.openai.com/docs/release-notes) | [Security](https://openai.com/security) | [Community](https://community.openai.com/) |
...

> ⚠️ **The URLs are auto-generated and require manual verification**  
> We aim to maintain these URLs to be pointing to the **current** document (TODO: Set up cron jobs/GitHub Actions to periodically re-run the scrapers and keep the dataset up-to-date)


## 🛠 Adding More APIs to the Dataset

### **Option 1: Manually Add to `api-docs-urls.csv`**
You can manually add new entries to `api-docs-urls.csv` with the following format:
```csv
API_Name,Official_Documentation_URL,Privacy_Policy_URL,Terms_of_Service_URL,Rate_Limiting_Policy_URL,Changelog_Release_Notes_URL,Security_Policy_URL,Developer_Community_Forum_URL
Example API,https://example.com/docs,https://example.com/privacy,https://example.com/tos,https://example.com/rate-limits,https://example.com/changelog,https://example.com/security,https://example.com/community
```

### **Option 2: Combine Multiple CSV Files**
If you have additional entries in separate CSV files, use the provided Python utility script to merge them into the main dataset.

#### Combine CSV Files
1. Ensure you have Python installed.
2. Run the script:
   ```bash
   python utils/combine_csv.py new_entries.csv api-docs-urls.csv combined_dataset.csv
   ```
3. Replace the existing `api-docs-urls.csv` with the new `combined_dataset.csv`.

---

## What can we do with the API URLs?

**Use Case 1:**
 You can use the scrapers (fast-scraper.js or accurate-scraper.js) to extract content from API docs and enhance your LLM to provide specific and accurate answers about APIs

**Workflow Example:**
1. Retrieve relevant snippets with a custom script / Query the vector database for a user question
2. Generate Answers with an LLM: Pass the retrieved snippets as context to the LLM (e.g., GPT-4 or LLaMA-2)

   ```python
   from transformers import AutoModelForCausalLM, AutoTokenizer
   from faiss import read_index

   # Load vector index
   index = read_index('vector_index.faiss')

   # Query embeddings
   user_query = "What are the rate limits for the OpenAI API?"
   query_embedding = model.encode(user_query)
   _, indices = index.search(np.array([query_embedding]), k=5)

   # Retrieve relevant chunks
   context = " ".join([documents[i] for i in indices[0]])

   # Use an LLM to answer
   model = AutoModelForCausalLM.from_pretrained('gpt-4')
   tokenizer = AutoTokenizer.from_pretrained('gpt-4')

   prompt = f"Context: {context}\nQuestion: {user_query}\nAnswer:"
   inputs = tokenizer(prompt, return_tensors='pt')
   outputs = model.generate(**inputs, max_new_tokens=200)
   print(tokenizer.decode(outputs[0], skip_special_tokens=True))
   ```

**Use Case 2:**
Maintain offline copies of API documentation for scenarios where internet access is unavailable or restricted. Offline access ensures reliability and speed when querying API documentation.

**How?**
- Use the scrapers to generate offline copies of the documentation in JSON, HTML, or Markdown formats.
- Serve these copies locally or integrate them into a lightweight desktop or web application.


**Use Case 3:**
API documentation changes frequently, and outdated information can lead to bugs or misconfigurations. Automating change detection ensures your knowledge base remains up-to-date.

**How?**
- Compare the current version of a page with its previously saved version.
- Use hashing (e.g., MD5) or diff-checking tools to detect changes in content.

---

## 🚀 How to Use the Scrapers



### Check Python Version
**Recommended Python Versions**: Python >=3.7 and <3.10

  1. Check your Python version:
     ```bash
     python --version
     ```
  2. If your Python version is incompatible, you can:
     - Install a compatible version (e.g., Python 3.9).
     - Use a virtual environment:
       ```bash
       python3.9 -m venv venv
       source venv/bin/activate  # Or venv\Scripts\activate on Windows
       pip install -r requirements.txt
       ```
  3. Alternatively, use Conda to install PyTorch and its dependencies:
     ```bash
     conda install pytorch torchvision torchaudio pytorch-cuda=11.8 -c pytorch -c nvidia
     ```



We provide two scraping tools to suit different needs:
- **`fast-scraper.js`**: A lightweight Cheerio-based scraper for fast retrieval of static content.
- **`accurate-scraper.js`**: A Playwright-based scraper for handling JavaScript-loaded pages and more dynamic content.


### **1. `fast-scraper.js` (Cheerio-Based)**
- **Purpose**: For quickly scraping static API documentation pages.
- **Strengths**:
  - Lightweight and fast.
  - Suitable for pages without JavaScript content.
- **Limitations**:
  - Does not handle JavaScript-loaded content.

#### Run the Script
1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the script:
   ```bash
   node fast-scraper.js
   ```
3. Results will be saved in `scraped_data_fast.json`.

---

### **2. `accurate-scraper.js` (Playwright-Based)**
- **Purpose**: For scraping API documentation pages that rely on JavaScript for rendering.
- **Strengths**:
  - Handles dynamic content and JavaScript-loaded pages.
  - More accurate for modern, interactive documentation sites.
- **Limitations**:
  - Slower compared to `fast-scraper.js`.

#### Run the Script
1. Install Playwright:
   ```bash
   npm install playwright
   ```
2. Run the script:
   ```bash
   node accurate-scraper.js
   ```
3. Results will be saved in `scraped_data_accurate.json`.

---



## 💡 How to Contribute

> For first time contributors, I recommend you to check out https://github.com/firstcontributions/first-contributions and https://www.youtube.com/watch?v=YaToH3s_-nQ

Contributions are welcome! Here's how you can contribute:


1. **Add API Entries**:
   - Add new API entries directly to `api-docs-urls.csv` or via pull request.
   - Ensure URLs point to the **current version** of the documentation and policies.
     
2. **Verify API Entries**:
   - Is the URL up-to-date?
   - Is the URL root-level for the relevant page? (`api.com/docs/`, not `api.com/docs/nested`)
   - Is the API doc public and does it comply with "robots.txt"?
   - Does the URL provide all the expected information (changelogs, rate limits, etc) ?
   - Is there any dynamically loaded page content that the scraper is able to extract?
     
3. **Improve Scrapers**:
   - Enhance `fast-scraper.js` or `accurate-scraper.js` for better performance and compatibility.
   - Add features like advanced error handling or field-specific scraping.
     
4. **Submit Pull Requests**:
   - Fork the repository.
   - Create a new branch for your changes.
   - Submit a pull request for review.

If you're using the scripts, first install dependencies:
```bash
npm install
pip install -r requirements.txt
```
This installs everything listed in package.json and requirements.txt


### 🚀 Roadmap Features
- 🔍 **Search & Browse:** Easily find APIs by keyword or category  (e.g., "Machine Learning APIs," "Finance APIs")  
- 📄 **Latest API Metadata Retrieval:** Retrieve up-to-date API endpoints and parameters, directly from official documentation.
- 🛠 **VS Code Integration:** Use the lightweight UpdAPI extension to search and retrieve APIs directly from your terminal.  

---

## 📜 License

This repository is licensed under the [MIT License](LICENSE).

---

## Status  

### 🛠 Current Phase:  
- **Under Construction:** We’re building the core MVP features and testing functionality.  

### 📌 Known Issues:  
- Limited API support.  
- Some features may not work as expected.  

Check the [Open Issues](https://github.com/in-c0/updapi/issues) for more details.

---

## Roadmap  

### ✅ MVP Goals  
- Basic search and browse functionality.  
- JSON exports for select APIs.  
- Direct links to official API documentation.  

### 🔜 Future Enhancements  
- IDE integrations (e.g., VS Code plugin).  
- API update notifications via email/webhooks.  
- Support for more APIs.  

---

## Community  

- [Discussions](https://github.com/in-c0/updapi/discussions)  
- [Bug Reports](https://github.com/in-c0/updapi/issues)  

---

## ❤️ Acknowledgments

We thank all API providers for publishing robust documentation and fostering developer-friendly ecosystems. Your contributions make projects like this possible!
Special thanks to:

- [Crawlee](https://github.com/apify/crawlee): A powerful web scraping and crawling library that simplifies the extraction of structured data from websites.
- [OpenAPI](https://github.com/APIs-guru/openapi-directory): For setting the standard in API specifications and enabling better interoperability and accessibility.


## Questions?

Send emails to support@updapi.com
