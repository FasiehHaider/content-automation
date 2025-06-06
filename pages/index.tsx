import { useState, useRef } from 'react';

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

type PromptType = '3-keywords' | '4-keywords' | 'meta-data';

const PROMPT_TYPES: Record<PromptType, string> = {
  '3-keywords': `You are a Cinematic B-roll Keyword Extractor, trained to generate precise, visually specific keyword phrases for stock footage.

OBJECTIVE: Generate one 3-word cinematic b-roll keyword phrase per sentence that is search-optimized for stock footage.

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
clock ticks hallway`,

  '4-keywords': `You are a Cinematic B-Roll Strategist trained to generate precise, visually specific keyword phrases for stock footage.

OBJECTIVE: Generate one 4-word cinematic b-roll keyword phrase per sentence that is search-optimized for stock footage.

RULES:
- Format: subject + action + camera + cinematic/emotional modifier
- Be emotionally expressive and visually specific
- Avoid clichés like "sad woman" or "person thinking"
- Make search-ready for cinematic stock b-roll
- Use only valid visual modifiers: close-up, spotlight, macro, silhouette, backlight, glow, hallway, mirror, rain, alley, shadows, fog, neon, doorway, flicker, drizzle
- Avoid abstract nouns, themes, or non-visual terms
- Focus on tangible, observable imagery

OUTPUT: Return ONLY a clean list of phrases, one per line. No bullets, numbers, or explanations.

Examples:
doctor pauses spotlight close-up
woman gargles mirror shadows
hands reveal macro spotlight
gums bleed close-up glow
teeth shine silhouette neon
mouth opens backlight fog
scientist types shadows mirror
bacteria spreads glow macro
child sips sink hallway
clock ticks doorway flicker`,

  'meta-data': `You are a Cinematic B-Roll Metadata Generator trained to assist post-production editors and creative directors in identifying visually taggable moments from long-form video scripts.

OBJECTIVE: Analyze a long-form narrative script. For every sentence, output:
1. Optional Title: → if the sentence implies a standalone, cinematic visual moment worthy of a B-roll clip
2. Mandatory Meta: → a flat, literal, comma-separated list of 3-5 visual search tags describing the scene

FORMATTING RULES:
- Each sentence MUST output exactly one Meta: line
- Add a Title: line ONLY if there is a cinematic visual moment (action, emotional beat, environmental shift)
- No empty lines. No bullet points. No markdown.
- Output must be plain text

TITLE GENERATION LOGIC:
Only add a Title: if the sentence implies a standalone cinematic visual beat.

✅ Include a Title if:
- There's a specific emotional or visual moment (crying, turning away, running, discovery, silence)
- A clear scene shift or setting is implied (lab, archive, hospital, night)
- Someone speaks with intensity, surprise, or vulnerability
- The action has symbolic or emotional stakes

❌ Do NOT include a Title if:
- The sentence conveys general information, statistics, or exposition
- The moment is abstract with no implied visuals
- It's part of a narration with no distinct scene

Title format: 4-7 word phrase, plain and literal

META LINE LOGIC:
Every sentence must include one Meta: line with 3-5 comma-separated visual tags.
Formula: [Human/Subject] + [Action or State] + [Location or Prop] + [Mood or Modifier]

✅ DO:
- Use literal nouns: woman, man, folder, lab, child
- Use visible actions or moods: crying, walking, whispering, alone, urgency
- Use locations and props: classroom, hallway, microscope, bed, office

❌ DO NOT:
- Use abstract tags: "hope," "success," "trust"
- Use symbolic phrases: "rock bottom," "new chapter"
- Repeat redundant mood tags

HUMAN SUBJECTS: Use literal roles - woman, man, dentist, assistant, child, scientist, grandmother

OUTPUT EXAMPLE:
Title: Avoiding Affection
Meta: woman, children, turning away, living room, sadness

Meta: scientist, laboratory, microscope, research, focused`
};

const AVAILABLE_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-4",
  "gpt-4-0613",
  "gpt-3.5-turbo",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano"
];

export default function KeywordExtractor() {
  const [script, setScript] = useState('');
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [selectedPromptType, setSelectedPromptType] = useState<PromptType>('4-keywords');
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({
    isProcessing: false,
    currentStep: ''
  });
  const [results, setResults] = useState<Results | null>(null);
  
  const knowledgeBaseRef = useRef<HTMLInputElement>(null);
  const schemaToolRef = useRef<HTMLInputElement>(null);

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
      currentStep: 'Analyzing script structure and emotional intensity...'
    });
    setResults(null);

    try {
      // Enhanced sentence splitting to handle VSL scripts better
      const sentences = script
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 10 && !s.match(/^\d+\.?\s*$/)); // Filter out numbering
      
      const chunks: string[] = [];
      
      setProcessingStatus({
        isProcessing: true,
        currentStep: `Found ${sentences.length} sentences. Creating processing chunks for ${selectedPromptType} analysis...`
      });
      
      // Process in chunks of 8 sentences for better API handling
      for (let i = 0; i < sentences.length; i += 8) {
        chunks.push(sentences.slice(i, i + 8).join('. ') + '.');
      }
      
      let allKeywords: string[] = [];
      
      // Read uploaded files if they exist
      let knowledgeBase = '';
      let schemaTool = '';
      
      const knowledgeBaseFile = knowledgeBaseRef.current?.files?.[0];
      const schemaToolFile = schemaToolRef.current?.files?.[0];
      
      if (knowledgeBaseFile) {
        knowledgeBase = await readFile(knowledgeBaseFile);
        setProcessingStatus({
          isProcessing: true,
          currentStep: 'Knowledge base loaded. Processing with enhanced context...'
        });
      }
      
      if (schemaToolFile) {
        schemaTool = await readFile(schemaToolFile);
        setProcessingStatus({
          isProcessing: true,
          currentStep: 'Schema tool loaded. Applying structured analysis...'
        });
      }
      
      for (let i = 0; i < chunks.length; i++) {
        setProcessingStatus({
          isProcessing: true,
          currentStep: `Processing chunk ${i + 1} of ${chunks.length} with ${selectedPromptType} extractor...`
        });
        
        const requestBody = {
          model: selectedModel,
          messages: JSON.stringify([
            { role: "system", content: PROMPT_TYPES[selectedPromptType] },
            { role: "user", content: `Analyze this VSL script and generate ${selectedPromptType} keywords:\n\n${chunks[i]}` }
          ]),
          temperature: 0.7,
          max_tokens: selectedPromptType === 'meta-data' ? 1500 : 1000,
          knowledge_base: knowledgeBase,
          schema_tool: schemaTool
        };

        const response = await fetch('https://dev.felidae.network/api/chatgpt/chat_completion', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        });

        const result = await response.json();
        const data = result.data || result;
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
          throw new Error('Invalid API response structure');
        }
        
        const content = data.choices[0].message.content.trim();
        
        let keywords: string[];
        
        if (selectedPromptType === 'meta-data') {
          // Parse metadata format
          keywords = content
            .split('\n')
            .filter((line: string) => line.trim().length > 0)
            .map((line: string) => line.trim());
        } else {
          // Parse keyword phrases
          const expectedWordCount = selectedPromptType === '3-keywords' ? 3 : 4;
          keywords = content
            .split('\n')
            .filter((k: string) => k.trim().length > 0)
            .map((k: string) => k.replace(/^[-•]\s*/, '').replace(/["']/g, '').trim())
            .filter((k: string) => {
              const wordCount = k.split(' ').length;
              if (selectedPromptType === 'meta-data' as PromptType) {
                return true; // Accept all lines for meta-data as they have their own format
              }
              return wordCount === expectedWordCount; // For 3-keywords and 4-keywords, enforce exact word count
            });
        }
        
        allKeywords.push(...keywords);
        
        // Respectful delay between requests
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      }
      
      // Enhanced results processing
      const processedKeywords = allKeywords.filter(k => k.length > 0);
      
      setResults({
        sentenceCount: sentences.length,
        keywordCount: processedKeywords.length,
        keywords: processedKeywords
      });
      
      setProcessingStatus({
        isProcessing: false,
        currentStep: `✓ Complete! Generated ${processedKeywords.length} ${selectedPromptType} entries from ${sentences.length} sentences.`
      });
      
    } catch (error) {
      console.error('Error processing keywords:', error);
      setResults({
        sentenceCount: 0,
        keywordCount: 0,
        keywords: [`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`]
      });
      setProcessingStatus({
        isProcessing: false,
        currentStep: 'Processing failed. Please try again.'
      });
    }
  };

  const copyResults = async () => {
    if (results?.keywords) {
      try {
        await navigator.clipboard.writeText(results.keywords.join('\n'));
        alert(`${selectedPromptType} results copied to clipboard!`);
      } catch (error) {
        console.error('Failed to copy to clipboard:', error);
        alert('Copy failed. Please select and copy manually.');
      }
    }
  };

  const downloadResults = () => {
    if (results?.keywords) {
      const content = results.keywords.join('\n');
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedPromptType}-results.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="container">
      <h1>🎬 B-Roll Cinematic Keyword Extractor</h1>
      
      <div className="info-box">
        <h3>🎯 How it works:</h3>
        <p>• Analyzes your VSL script sentence by sentence using professional film logic</p>
        <p>• Generates emotionally-driven, search-optimized phrases for stock b-roll footage</p>
        <p>• Handles long-form scripts (27+ pages) with intelligent chunking</p>
        
        {selectedPromptType === '3-keywords' && (
          <div className="prompt-details">
            <h4>📝 3-Keywords Mode:</h4>
            <p>• <strong>Format:</strong> subject + action + visual modifier</p>
            <p>• <strong>Example:</strong> "woman staring mirror", "hands shake coffee", "doctor pauses spotlight"</p>
            <p>• <strong>Focus:</strong> Emotional intensity scoring (1-5) with cinematic modifiers</p>
          </div>
        )}
        
        {selectedPromptType === '4-keywords' && (
          <div className="prompt-details">
            <h4>🎥 4-Keywords Mode (SAC+ Logic):</h4>
            <p>• <strong>Format:</strong> subject + action + camera + modifier</p>
            <p>• <strong>Example:</strong> "woman covers mouth soft blur", "man grips phone flicker"</p>
            <p>• <strong>Focus:</strong> Professional cinematography with Subject-Action-Camera-Modifier structure</p>
            <p>• <strong>Emotional Logic:</strong> Fear/Urgency → red glow, flicker | Shame/Nostalgia → soft blur, silhouette</p>
          </div>
        )}
        
        {selectedPromptType === 'meta-data' && (
          <div className="prompt-details">
            <h4>📊 Metadata Mode:</h4>
            <p>• <strong>Output:</strong> Title + Meta tags for each cinematic moment</p>
            <p>• <strong>Title Example:</strong> "Avoiding Affection"</p>
            <p>• <strong>Meta Example:</strong> "woman, children, turning away, living room, sadness"</p>
            <p>• <strong>Focus:</strong> Stock footage tagging with 3-5 visual descriptors per scene</p>
          </div>
        )}
      </div>

      <div className="file-upload">
        <h4>📁 Optional Enhancement Files:</h4>
        <div className="file-row">
          <label htmlFor="knowledgeBase">Knowledge Base File:</label>
          <input 
            type="file" 
            id="knowledgeBase" 
            ref={knowledgeBaseRef}
            accept=".txt,.json,.csv"
          />
        </div>
        
        <div className="file-row">
          <label htmlFor="schemaTool">Schema Tool File:</label>
          <input 
            type="file" 
            id="schemaTool" 
            ref={schemaToolRef}
            accept=".txt,.json,.csv"
          />
        </div>
      </div>

      <div className="controls">
        <div className="control-group">
          <label htmlFor="modelSelect">🤖 AI Model:</label>
          <select 
            id="modelSelect" 
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {AVAILABLE_MODELS.map(model => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label htmlFor="promptTypeSelect">🎭 Extraction Mode:</label>
          <select 
            id="promptTypeSelect" 
            value={selectedPromptType}
            onChange={(e) => setSelectedPromptType(e.target.value as PromptType)}
          >
            <option value="4-keywords">🎥 4-Keywords (SAC+ Logic)</option>
            <option value="3-keywords">📝 3-Keywords (Emotional)</option>
            <option value="meta-data">📊 Metadata Generator</option>
          </select>
        </div>
      </div>
      
      <textarea 
        value={script}
        onChange={(e) => setScript(e.target.value)}
        placeholder="📄 Paste your VSL script here... (supports long-form scripts 27+ pages)"
        className="script-input"
      />
      
      <button 
        onClick={extractKeywords}
        disabled={processingStatus.isProcessing}
        className="extract-button"
      >
        {processingStatus.isProcessing ? '⚡ Processing...' : '🚀 Extract Keywords'}
      </button>
      
      {processingStatus.isProcessing && (
        <div className="loading">
          <div className="loading-spinner">⚡</div>
          <div>Processing your script with {selectedPromptType} logic...</div>
          <div className="processing-status">{processingStatus.currentStep}</div>
        </div>
      )}
      
      {results && (
        <div className="results">
          <h3>✨ Generated Results:</h3>
          <div className="stats">
            📊 Sentences processed: <span>{results.sentenceCount}</span> | 
            🎯 {selectedPromptType} generated: <span>{results.keywordCount}</span> |
            📈 Success rate: <span>{Math.round((results.keywordCount / results.sentenceCount) * 100)}%</span>
          </div>
          <div className="output">
            {selectedPromptType === 'meta-data' ? (
              (() => {
                const lines = results.keywords;
                const groups = [];
                for (let i = 0; i < lines.length; ) {
                  if (lines[i].startsWith('Title:')) {
                    groups.push(`${lines[i]}\n${lines[i + 1] || ''}`);
                    i += 2;
                  } else if (lines[i].startsWith('Meta:')) {
                    groups.push(lines[i]);
                    i += 1;
                  } else {
                    i += 1;
                  }
                }
                return groups.join('\n\n');
              })()
            ) : (
              results.keywords.join('\n')
            )}
          </div>
          <div className="action-buttons">
            <button onClick={copyResults} className="copy-button">
              📋 Copy All Results
            </button>
            <button onClick={downloadResults} className="download-button">
              💾 Download .txt
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .container {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 900px;
          margin: 40px auto;
          padding: 30px;
          line-height: 1.6;
        }
        
        h1 {
          color: #2c3e50;
          text-align: center;
          margin-bottom: 30px;
          font-size: 2.2em;
          font-weight: 700;
        }
        
        .script-input {
          width: 100%;
          height: 220px;
          margin: 20px 0;
          padding: 15px;
          font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
          border: 2px solid #e1e8ed;
          border-radius: 8px;
          resize: vertical;
          font-size: 14px;
          line-height: 1.5;
          transition: border-color 0.3s ease;
        }
        
        .script-input:focus {
          outline: none;
          border-color: #007cba;
          box-shadow: 0 0 0 3px rgba(0, 124, 186, 0.1);
        }
        
        .extract-button, .copy-button, .download-button {
          padding: 12px 24px;
          margin: 10px 5px;
          cursor: pointer;
          background: linear-gradient(135deg, #007cba 0%, #005a87 100%);
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 15px;
          font-weight: 600;
          transition: all 0.3s ease;
          box-shadow: 0 2px 4px rgba(0, 124, 186, 0.2);
        }
        
        .extract-button:hover, .copy-button:hover, .download-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(0, 124, 186, 0.3);
        }
        
        .extract-button:disabled {
          background: #cbd5e0;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        
        .copy-button {
          background: linear-gradient(135deg, #28a745 0%, #218838 100%);
          box-shadow: 0 2px 4px rgba(40, 167, 69, 0.2);
        }
        
        .download-button {
          background: linear-gradient(135deg, #6f42c1 0%, #5a359a 100%);
          box-shadow: 0 2px 4px rgba(111, 66, 193, 0.2);
        }
        
        .output {
          background: #f8f9fa;
          padding: 20px;
          margin: 25px 0;
          font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
          white-space: pre-line;
          border: 1px solid #e9ecef;
          border-radius: 8px;
          max-height: 500px;
          overflow-y: auto;
          font-size: 13px;
          line-height: 1.6;
        }
        
        .loading {
          color: #6c757d;
          margin: 25px 0;
          text-align: center;
          padding: 20px;
          background: #f8f9fa;
          border-radius: 8px;
        }

        .loading-spinner {
          font-size: 24px;
          margin-bottom: 10px;
          animation: pulse 1.5s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .processing-status {
          font-size: 13px;
          color: #007cba;
          margin-top: 8px;
          font-weight: 500;
        }

        .file-upload {
          margin: 25px 0;
          padding: 20px;
          background: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 8px;
        }

        .file-upload h4 {
          margin-top: 0;
          margin-bottom: 15px;
          color: #495057;
        }

        .file-row {
          margin-bottom: 15px;
        }

        .file-upload label {
          display: block;
          margin-bottom: 6px;
          font-weight: 600;
          color: #495057;
          font-size: 14px;
        }
        
        .file-upload input[type="file"] {
          width: 100%;
          padding: 8px;
          border: 1px solid #ced4da;
          border-radius: 4px;
          background: white;
        }

        .controls {
          margin: 25px 0;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }

        .control-group {
          display: flex;
          flex-direction: column;
        }

        .controls label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          color: #495057;
          font-size: 14px;
        }

        .controls select {
          padding: 10px 12px;
          border: 2px solid #e1e8ed;
          border-radius: 6px;
          background: white;
          font-size: 14px;
          transition: border-color 0.3s ease;
        }

        .controls select:focus {
          outline: none;
          border-color: #007cba;
          box-shadow: 0 0 0 3px rgba(0, 124, 186, 0.1);
        }

        .info-box {
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
          padding: 25px;
          margin: 25px 0;
          border-left: 5px solid #007cba;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .info-box h3 {
          margin-top: 0;
          margin-bottom: 15px;
          color: #2c3e50;
        }

        .info-box p {
          margin: 8px 0;
          color: #495057;
        }

        .prompt-details {
          margin-top: 20px;
          padding: 15px;
          background: rgba(255, 255, 255, 0.7);
          border-radius: 6px;
          border: 1px solid #dee2e6;
        }

        .prompt-details h4 {
          margin-top: 0;
          margin-bottom: 12px;
          color: #007cba;
        }

        .results {
          margin-top: 30px;
          padding: 25px;
          background: white;
          border: 2px solid #e9ecef;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        }

        .results h3 {
          margin-top: 0;
          margin-bottom: 15px;
          color: #28a745;
        }

        .stats {
          font-size: 14px;
          color: #6c757d;
          margin-bottom: 20px;
          padding: 12px;
          background: #f8f9fa;
          border-radius: 6px;
        }

        .stats span {
          font-weight: 700;
          color: #007cba;
        }

        .action-buttons {
          margin-top: 20px;
          text-align: center;
        }

        @media (max-width: 768px) {
          .container {
            margin: 20px auto;
            padding: 20px;
          }
          
          .controls {
            grid-template-columns: 1fr;
            gap: 15px;
          }
          
          h1 {
            font-size: 1.8em;
          }
        }
      `}</style>
    </div>
  );
}