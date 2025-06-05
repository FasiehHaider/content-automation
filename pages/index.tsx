import { useState, useRef } from 'react';
import Head from 'next/head';

interface ProcessingStatus {
  isProcessing: boolean;
  currentStep: string;
  progress?: string;
}

interface Results {
  sentenceCount: number;
  keywordCount: number;
  keywords: string[];
}

export default function KeywordExtractor() {
  const [script, setScript] = useState('');
  const [selectedModel, setSelectedModel] = useState('gpt-4');
  const [wordCount, setWordCount] = useState(3);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({
    isProcessing: false,
    currentStep: ''
  });
  const [results, setResults] = useState<Results | null>(null);
  
  const knowledgeBaseRef = useRef<HTMLInputElement>(null);
  const schemaToolRef = useRef<HTMLInputElement>(null);

  const systemPrompt = `You are a Cinematic B-roll Keyword Extractor.

OBJECTIVE: Generate one cinematic b-roll keyword phrase per sentence from VSL scripts.

RULES:
- Format: subject + action + cinematic/emotional modifier
- Be emotionally expressive and visually specific
- Avoid clichés like "sad woman" or "person thinking"
- Make search-ready for cinematic stock b-roll
- Use only valid visual modifiers: close-up, spotlight, macro, silhouette, backlight, glow, hallway, mirror, rain, alley, shadows, fog, neon, doorway, flicker, drizzle
- Avoid abstract nouns, themes, or non-visual terms
- Focus on tangible, observable imagery

OUTPUT: Return ONLY a clean list of phrases, one per line. No bullets, numbers, or explanations.

Examples:
doctor pauses spotlight
woman gargles mirror
hands reveal macro
gums bleed close-up
teeth shine silhouette
mouth opens backlight
scientist types shadows
bacteria spreads glow
child sips sink
clock ticks hallway`;

  const readFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  };

  const extractKeywords = async () => {
    if (!script.trim()) {
      alert('Please enter a script');
      return;
    }

    setProcessingStatus({
      isProcessing: true,
      currentStep: 'Analyzing script structure...'
    });
    setResults(null);

    try {
      const sentences = script.split(/[.!?]+/).filter(s => s.trim().length > 10);
      const chunks: string[] = [];
      
      setProcessingStatus({
        isProcessing: true,
        currentStep: `Found ${sentences.length} sentences. Creating processing chunks...`
      });
      
      // Process in chunks of 10 sentences
      for (let i = 0; i < sentences.length; i += 10) {
        chunks.push(sentences.slice(i, i + 10).join('. '));
      }
      
      let allKeywords: string[] = [];
      
      // Read uploaded files if they exist
      let knowledgeBase = '';
      let schemaTool = '';
      
      const knowledgeBaseFile = knowledgeBaseRef.current?.files?.[0];
      const schemaToolFile = schemaToolRef.current?.files?.[0];
      
      if (knowledgeBaseFile) {
        knowledgeBase = await readFile(knowledgeBaseFile);
      }
      
      if (schemaToolFile) {
        schemaTool = await readFile(schemaToolFile);
      }
      
      for (let i = 0; i < chunks.length; i++) {
        setProcessingStatus({
          isProcessing: true,
          currentStep: `Processing chunk ${i + 1} of ${chunks.length}...`
        });
        
        const response = await fetch('https://dev.felidae.network/api/chatgpt/chat_completion', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: JSON.stringify([
              { role: "system", content: systemPrompt },
              { role: "user", content: `Extract ${wordCount}-word cinematic keywords: ${chunks[i]}` }
            ]),
            temperature: 0.7,
            max_tokens: 1000,
            knowledge_base: knowledgeBase,
            schema_tool: schemaTool
          })
        });

        const result = await response.json();
        const data = result.data || result;
        const keywords = data.choices[0].message.content
          .trim()
          .split('\n')
          .filter((k: string) => k.trim().length > 0 && k.trim().split(' ').length === wordCount)
          .map((k: string) => k.replace(/["']/g, '').trim());
        
        allKeywords.push(...keywords);
        
        // Small delay between requests
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // Update results
      setResults({
        sentenceCount: sentences.length,
        keywordCount: allKeywords.length,
        keywords: allKeywords
      });
      
    } catch (error) {
      console.error('Error processing keywords:', error);
      setResults({
        sentenceCount: 0,
        keywordCount: 0,
        keywords: [`Error: ${error instanceof Error ? error.message : 'Unknown error'}`]
      });
    }
    
    setProcessingStatus({
      isProcessing: false,
      currentStep: ''
    });
  };

  const copyResults = async () => {
    if (results?.keywords) {
      try {
        await navigator.clipboard.writeText(results.keywords.join('\n'));
        alert('Keywords copied to clipboard!');
      } catch (error) {
        console.error('Failed to copy to clipboard:', error);
      }
    }
  };

  return (
    <>
      <Head>
        <title>3-Word Cinematic Keyword Extractor</title>
        <meta name="description" content="Extract cinematic keywords from VSL scripts for b-roll footage" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="container">
        <h1>3-Word Cinematic Keyword Extractor</h1>
        
        <div className="info-box">
          <h3>How it works:</h3>
          <p>• Analyzes your VSL script sentence by sentence</p>
          <p>• Generates exactly selected-word cinematic phrases for b-roll footage</p>
          <p>• Format: <strong>subject + action + visual modifier</strong></p>
          <p>• Example: "woman staring mirror", "hands shake coffee"</p>
        </div>

        <div className="file-upload">
          <label htmlFor="knowledgeBase">Knowledge Base File (Optional):</label>
          <input 
            type="file" 
            id="knowledgeBase" 
            ref={knowledgeBaseRef}
            accept=".txt,.json,.csv"
          />
          
          <label htmlFor="schemaTool">Schema Tool File (Optional):</label>
          <input 
            type="file" 
            id="schemaTool" 
            ref={schemaToolRef}
            accept=".txt,.json,.csv"
          />
        </div>

        <div className="controls">
          <div>
            <label htmlFor="modelSelect">Select Model:</label>
            <select 
              id="modelSelect" 
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              <option value="gpt-4">GPT-4</option>
              <option value="gpt-4.1-nano">GPT-4.1 Nano</option>
            </select>
          </div>

          <div>
            <label htmlFor="wordCountSelect">Word Count per Phrase:</label>
            <select 
              id="wordCountSelect" 
              value={wordCount}
              onChange={(e) => setWordCount(parseInt(e.target.value))}
            >
              <option value={3}>3 Words</option>
              <option value={4}>4 Words</option>
            </select>
          </div>
        </div>
        
        <textarea 
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="Paste your VSL script here..."
          className="script-input"
        />
        
        <button 
          onClick={extractKeywords}
          disabled={processingStatus.isProcessing}
          className="extract-button"
        >
          {processingStatus.isProcessing ? 'Processing...' : 'Extract Keywords'}
        </button>
        
        {processingStatus.isProcessing && (
          <div className="loading">
            <div>Processing your script...</div>
            <div className="processing-status">{processingStatus.currentStep}</div>
          </div>
        )}
        
        {results && (
          <div className="results">
            <h3>Generated Keywords:</h3>
            <div className="stats">
              Sentences processed: <span>{results.sentenceCount}</span> | 
              Keywords generated: <span>{results.keywordCount}</span>
            </div>
            <div className="output">
              {results.keywords.join('\n')}
            </div>
            <button onClick={copyResults} className="copy-button">
              Copy All Keywords
            </button>
          </div>
        )}

        <style jsx>{`
          .container {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
          }
          
          .script-input {
            width: 100%;
            height: 200px;
            margin: 10px 0;
            padding: 10px;
            font-family: monospace;
            border: 1px solid #ddd;
            border-radius: 4px;
            resize: vertical;
          }
          
          .extract-button, .copy-button {
            padding: 10px 20px;
            margin: 10px 0;
            cursor: pointer;
            background: #007cba;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 14px;
          }
          
          .extract-button:hover, .copy-button:hover {
            background: #005a87;
          }
          
          .extract-button:disabled {
            background: #ccc;
            cursor: not-allowed;
          }
          
          .output {
            background: #f5f5f5;
            padding: 15px;
            margin: 20px 0;
            font-family: monospace;
            white-space: pre-line;
            border: 1px solid #ddd;
            border-radius: 4px;
            max-height: 400px;
            overflow-y: auto;
          }
          
          .loading {
            color: #666;
            margin: 20px 0;
          }

          .processing-status {
            font-size: 12px;
            color: #888;
            margin-top: 5px;
          }

          .file-upload {
            margin: 15px 0;
            padding: 15px;
            background: #f9f9f9;
            border: 1px solid #ddd;
            border-radius: 4px;
          }

          .file-upload label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
          }
          
          .file-upload input[type="file"] {
            margin-bottom: 10px;
            width: 100%;
          }

          .controls {
            margin: 15px 0;
          }

          .controls > div {
            margin-bottom: 15px;
          }

          .controls label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
          }

          .controls select {
            padding: 8px;
            width: 200px;
            border: 1px solid #ddd;
            border-radius: 4px;
          }

          .info-box {
            background: #f9f9f9;
            padding: 15px;
            margin: 15px 0;
            border-left: 4px solid #007cba;
            border-radius: 4px;
          }

          .info-box h3 {
            margin-top: 0;
          }

          .results {
            margin-top: 20px;
          }

          .stats {
            font-size: 12px;
            color: #666;
            margin-bottom: 10px;
          }

          .stats span {
            font-weight: bold;
          }

          .copy-button {
            margin-top: 10px;
            background: #28a745;
          }

          .copy-button:hover {
            background: #218838;
          }
        `}</style>
      </div>
    </>
  );
} 