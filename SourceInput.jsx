import React, { useRef, useState } from 'react';
import { fixtures } from './engine.js';
import { fetchSource, live } from './api.js';
import { MAX_BYTES, checkSize } from './imports.js';

export default function SourceInput({ busy, onSubmit }) {
  const [mode, setMode] = useState('JSON upload');
  const [raw, setRaw] = useState(JSON.stringify(fixtures[0], null, 2));
  const [url, setUrl] = useState('');
  const [source, setSource] = useState({ kind: 'manual', name: 'Patient example' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const operation = useRef(0);
  const disabled = busy || loading;

  function load(rawText, origin) {
    setRaw(checkSize(rawText));
    setSource(origin);
    setError('');
  }

  async function readFile(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const token = ++operation.current;
    setLoading(true);
    setError('');
    try {
      if (!file.name.toLowerCase().endsWith('.json')) throw new Error('Choose a .json file.');
      if (file.size > MAX_BYTES) throw new Error('Use a JSON document smaller than 1 MiB.');
      const text = await file.text();
      if (token === operation.current) load(text, { kind: 'file', name: file.name });
    } catch (error) {
      if (token === operation.current) setError(error.message);
    } finally {
      if (token === operation.current) setLoading(false);
    }
  }

  async function readUrl() {
    const token = ++operation.current;
    setLoading(true);
    setError('');
    try {
      const document = await fetchSource(url);
      if (token === operation.current) load(document.raw, { kind: 'url', name: document.url });
    } catch (error) {
      if (token === operation.current) setError(error.message);
    } finally {
      if (token === operation.current) setLoading(false);
    }
  }

  return <section className="panel">
    <div className="panelHead"><h2>Import resources</h2><small className="tag">FHIR JSON</small></div>
    <div className="editorBody">
      <div className="examples inputModes" aria-label="Input method">
        {['JSON upload', 'From link'].map(label => <button key={label} disabled={disabled} aria-pressed={mode === label} onClick={() => { setMode(label); setError(''); }}>{label}</button>)}
      </div>
      {mode === 'JSON upload' ? <div className="sourceBox">
        <label htmlFor="json-file">Choose a JSON file</label>
        <input id="json-file" type="file" accept=".json,application/json,application/fhir+json" disabled={disabled} onChange={readFile} />
        <p className="inputHint">Patient, Observation or collection/searchset Bundle · Up to 1 MiB and 100 resources.</p>
      </div> : <div className="sourceBox">
        <label htmlFor="source-url">FHIR JSON URL</label>
        <input id="source-url" type="url" placeholder="https://hapi.fhir.org/baseR4/Patient?_count=5" value={url} disabled={disabled} onChange={event => setUrl(event.target.value)} />
        <button className="secondary" disabled={disabled || !url.trim()} onClick={readUrl}>{loading ? 'Loading…' : 'Load preview'}</button>
        <p className="inputHint">{live ? 'The gateway fetches the URL for preview.' : 'Demo links must allow browser access (CORS).'} Search results import the current page only.</p>
      </div>}
      {error && <p role="alert" className="issue">{error} The preview below has not changed.</p>}
      <div className="examples" aria-label="Examples">{['Patient', 'Observation', 'Broken reference'].map((name, index) => <button key={name} disabled={disabled} onClick={() => load(JSON.stringify(fixtures[index], null, 2), { kind: 'manual', name: name + ' example' })}>{name}</button>)}</div>
      <label htmlFor="payload">Preview or paste JSON</label>
      <p className="inputHint sourceName">Source · {source.name}</p>
      <textarea id="payload" spellCheck="false" value={raw} disabled={disabled} onChange={event => { setRaw(event.target.value); setSource({ kind: 'manual', name: 'Edited JSON' }); setError(''); }} />
      <p className="inputHint">Previewing does not insert data. Import runs each resource through validation.</p>
      <button className="primary" disabled={disabled || !raw.trim()} onClick={() => onSubmit(raw, source)}>{busy ? 'Importing…' : 'Validate & import'}</button>
    </div>
  </section>;
}
