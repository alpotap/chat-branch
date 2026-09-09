import React, { useEffect, useRef, useState } from 'react';
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
  const [isOpen, setIsOpen] = useState(false);
  const { results, loading, error } = useSearch(query);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const selectResult = (result: SearchResult) => {
    setQuery('');
    setIsOpen(false);
    onSelectResult(result);
  };

  const clearQuery = () => {
    setQuery('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const showResults = isOpen && query.trim().length >= 2;

  return (
    <div className="global-search" ref={containerRef}>
      <label className="global-search-label" htmlFor="global-search-input">Search</label>
      <div className="global-search-input-wrap">
        <input
          id="global-search-input"
          ref={inputRef}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setIsOpen(true); }}
          onFocus={() => { if (query.trim().length >= 2) setIsOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              if (query) clearQuery();
              else setIsOpen(false);
            }
          }}
          placeholder="Search notes and chats"
          autoComplete="off"
          aria-controls="global-search-results"
          aria-expanded={showResults}
        />
        {query && (
          <button
            type="button"
            className="global-search-clear"
            onMouseDown={(event) => event.preventDefault()}
            onClick={clearQuery}
            aria-label="Clear search"
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>
      {showResults && (
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
              {result.is_archived && <span className="archive-badge">Archived</span>}
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