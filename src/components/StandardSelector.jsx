import { useEffect, useMemo, useRef, useState } from 'react';
import { getAllStandards } from '../lib/graphStore.js';

function useJurisdictionStandards(state) {
  const allStandards = useMemo(() => getAllStandards(), []);
  return useMemo(
    () =>
      state === 'all'
        ? allStandards
        : allStandards.filter((standard) => standard.jurisdiction === state),
    [allStandards, state]
  );
}

/**
 * Typeahead search box: type a standard code or description keyword to see
 * matches in a dropdown overlay, then click (or arrow+enter) to select it.
 *
 * @param {object} props
 * @param {string|null} props.selectedId
 * @param {(id: string) => void} props.onSelect
 * @param {string} [props.state] - jurisdiction filter ("all" or a state name)
 */
export function StandardSearchField({ selectedId, onSelect, state = 'all' }) {
  const standards = useJurisdictionStandards(state);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return standards;
    return standards.filter(
      (standard) =>
        standard.code.toLowerCase().includes(normalized) ||
        standard.description.toLowerCase().includes(normalized)
    );
  }, [query, standards]);

  useEffect(() => {
    function handleOutsideClick(evt) {
      if (wrapperRef.current && !wrapperRef.current.contains(evt.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handlePick = (standard) => {
    onSelect(standard.id);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div className="standard-search-field" ref={wrapperRef}>
      <label className="field-label" htmlFor="standard-search">
        Search by code or description
      </label>
      <input
        id="standard-search"
        type="text"
        autoComplete="off"
        value={query}
        onChange={(evt) => {
          setQuery(evt.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="e.g. NY-7.EE.1"
        className="standard-input"
      />

      {isOpen && (
        <ul className="standard-options">
          {filtered.length === 0 && (
            <li className="standard-option-empty">No standards match "{query}".</li>
          )}
          {filtered.map((standard) => (
            <li key={standard.id}>
              <button
                type="button"
                className={`standard-option${standard.id === selectedId ? ' is-active' : ''}`}
                onClick={() => handlePick(standard)}
              >
                <span className="standard-option-top">
                  <span className="standard-option-code">{standard.code}</span>
                  <span className="standard-option-grade">Grade {standard.grade}</span>
                </span>
                <span className="standard-option-desc">{standard.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Plain dropdown that lists every standard (for the current state filter)
 * by code, for directly jumping to one without typing.
 *
 * @param {object} props
 * @param {string|null} props.selectedId
 * @param {(id: string) => void} props.onSelect
 * @param {string} [props.state] - jurisdiction filter ("all" or a state name)
 */
export function StandardPicker({ selectedId, onSelect, state = 'all' }) {
  const standards = useJurisdictionStandards(state);

  return (
    <div className="standard-picker-field">
      <label className="field-label" htmlFor="standard-picker">
        Standard
      </label>
      <select
        id="standard-picker"
        className="standard-picker-select"
        value={selectedId || ''}
        onChange={(evt) => {
          if (evt.target.value) onSelect(evt.target.value);
        }}
      >
        <option value="">Choose a standard</option>
        {standards.map((standard) => (
          <option key={standard.id} value={standard.id}>
            {standard.code}
          </option>
        ))}
      </select>
    </div>
  );
}
