import React, { useState } from 'react';
import { SearchResult, useSearch } from '../hooks/useSearch';

interface GlobalSearchProps {
  onSelectResult: (result: SearchResult) => void;
}

const matchLabel = (result: SearchResult) => {
  switch (result.match_type) {
    case 'note_title': return 'Note title';
    case 'note_text': return 'Note text';
    case 'conversation_title': return 'Chat title';
    default: return 'Chat message';
  }
};

const GlobalSearch: React.FC<GlobalSearchProps> = ({ onSelectResult }) => {
  const [query, setQuery] = useState('');
  const { results, loading, error } = useSearch(query);

  const selectResult = (result: SearchResult) => {
    setQuery('');
    onSelectResult(result);
  };

  return (
    <div className="global-search">
      <label className="global-search-label" htmlFor="global-search-input">Search</label>
      <input
        id="global-search-input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setQuery('');
        }}
        placeholder="Search notes and chats"
        autoComplete="off"
        aria-controls="global-search-results"
        aria-expanded={query.trim().length >= 2}
      />
      {query.trim().length >= 2 && (
        <div className="global-search-results" id="global-search-results" role="listbox">
          {loading && <div className="global-search-status">Searching...</div>}
          {!loading && error && <div className="global-search-status">{error}</div>}
          {!loading && !error && results.length === 0 && <div className="global-search-status">No matches</div>}
          {!loading && !error && results.map((result, index) => (
            <button
              key={`${result.result_type}-${result.note_id || result.conversation_id}-${result.text_id || result.message_id || index}`}
              className="global-search-result"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectResult(result)}
              role="option"
            >
              <span className={`global-search-type ${result.result_type}`}>
                {result.result_type === 'note' ? 'Note' : 'Chat'}
              </span>
              <strong>{result.note_title || result.conversation_title || 'Untitled'}</strong>
              <span className="global-search-match">{matchLabel(result)}</span>
              <span className="global-search-snippet">{result.snippet}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default GlobalSearch;