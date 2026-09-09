import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

export interface SearchResult {
  result_type: 'note' | 'chat';
  match_type: 'note_title' | 'note_text' | 'conversation_title' | 'message';
  snippet: string;
  note_id?: string | null;
  note_title?: string | null;
  text_id?: string | null;
  conversation_id?: string | null;
  conversation_title?: string | null;
  message_id?: string | null;
  branch_name?: string | null;
}

const API_BASE = process.env.REACT_APP_API_BASE || '/api';

export const useSearch = (query: string) => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmedQuery = query.trim();
    const requestId = ++requestIdRef.current;

    if (trimmedQuery.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await axios.get(`${API_BASE}/search`, {
          params: { q: trimmedQuery, limit: 50 }
        });
        if (requestId === requestIdRef.current) {
          setResults(Array.isArray(response.data?.results) ? response.data.results : []);
        }
      } catch (requestError) {
        if (requestId === requestIdRef.current) {
          setResults([]);
          setError('Search is unavailable right now.');
        }
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  return { results, loading, error };
};