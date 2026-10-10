import React, { useEffect, useMemo, useState } from 'react';
import {
  TextField, MenuItem, ListSubheader, InputAdornment, IconButton, CircularProgress, Box, Typography, Chip, useTheme
} from '@mui/material';
import { Search as SearchIcon, Close as CloseIcon } from '@mui/icons-material';

// Group headers, in display order. "Selected" = lots already on the line that the current list
// (or search) doesn't show — kept so a saved or picked lot never blanks out.
const GROUP_ORDER = ['Selected', 'This client', 'In-house stock', "Other clients' lots"];

// Lot number + maker bill number, for matching what the operator typed.
const matches = (o, term) => {
  if (!term) return true;
  const hay = `${o?.lotNumber || ''} ${o?.invoiceNumber ?? ''}`.toLowerCase();
  return hay.includes(term.toLowerCase());
};

/**
 * Lot picker for invoice lines: a plain Select whose menu starts with a SEARCH BOX.
 *   • Typing filters the lots already listed, instantly (lot no. / maker bill no.).
 *   • 🔍 or Enter asks the SERVER — `searchLots(term)` → Promise<lots>; the parent decides the
 *     scope (this client + in-house, every client, or the damaged pool) — and the list then shows
 *     ONLY the matches. ✕ brings the normal list back.
 *   • Each picker keeps its own search; `resetKey` (client / switches) starts it afresh.
 *   • Lots already on the line always stay visible under "Selected".
 *
 * single:   value = lot id | null,  onChange(lotObject | null)
 * multiple: value = [lot ids],      onChange([lotObjects])
 */
export default function LotSelect({
  options = [],
  value,
  multiple = false,
  selectedLots = [],
  onChange,
  disabled = false,
  loading = false,
  placeholder = 'Pick a lot',
  searchPlaceholder = 'Search lot no. / bill no.',
  searchLots,
  resetKey,
  groupBy,
  getLabel = (o) => o?.lotNumber || '',
  renderOption
}) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState(null); // server matches; null = no server search active
  const [searchedFor, setSearchedFor] = useState('');
  const [searching, setSearching] = useState(false);
  // The theme's Menu override paints Select menus near-black in dark mode via a
  // `[data-mui-color-scheme="dark"] &` rule, which out-ranks an sx background. An inline style
  // always wins, so the menu gets the same surface as every other Paper — e.g. the Client
  // dropdown (Autocomplete) — in both modes.
  const theme = useTheme();
  const paperBg = theme.vars?.palette?.background?.paper || theme.palette.background.paper;

  // New client / switch → new context: drop this picker's search.
  useEffect(() => {
    setTerm('');
    setResults(null);
    setSearchedFor('');
  }, [resetKey]);

  // What the menu shows: (server matches, else the normal list) filtered by the typed text,
  // plus the line's own lots; grouped, server order kept within a group.
  const { list, byId, shownCount } = useMemo(() => {
    const map = new Map();
    const out = [];
    const add = (o) => {
      const id = String(o?._id || '');
      if (!id || map.has(id)) return;
      map.set(id, o);
      out.push(o);
    };
    const base = results !== null ? results : (options || []);
    const t = term.trim();
    base.filter((o) => matches(o, t)).forEach(add);
    const count = out.length;
    // Lots already on the line: full details when we have them, else the saved snapshot.
    const known = new Map([...(options || []), ...(results || [])].map((o) => [String(o._id), o]));
    (selectedLots || []).forEach((s) => {
      const id = String(s?._id || '');
      if (!id || map.has(id)) return;
      const full = known.get(id);
      add(full ? { ...full, _selected: true } : { ...s, _selected: true, _fallback: true });
    });
    const groupOf = (o) => (o._selected ? 'Selected' : (groupBy ? groupBy(o) : null));
    const rank = (o) => {
      const i = GROUP_ORDER.indexOf(groupOf(o));
      return i === -1 ? GROUP_ORDER.length : i;
    };
    out.sort((a, b) => rank(a) - rank(b)); // Array.sort is stable
    return { list: out.map((o) => ({ o, group: groupOf(o) })), byId: map, shownCount: count };
  }, [options, results, term, selectedLots, groupBy]);

  const clearSearch = () => {
    setTerm('');
    setResults(null);
    setSearchedFor('');
  };
  const runSearch = () => {
    const t = term.trim();
    if (!t) {
      clearSearch();
      return;
    }
    if (!searchLots) return;
    setSearching(true);
    setSearchedFor(t);
    Promise.resolve(searchLots(t))
      .then((rows) => setResults(rows || []))
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  };

  const busy = loading || searching;
  const items = [
    // Search row — a ListSubheader so it is not selectable and stays on top while scrolling.
    <ListSubheader key="__search" sx={{ py: 1, bgcolor: 'background.paper', backgroundImage: 'none', zIndex: 2, lineHeight: 'normal' }}>
      <TextField
        size="small"
        fullWidth
        autoFocus
        value={term}
        placeholder={searchPlaceholder}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            runSearch();
          }
          // Keep the menu's type-to-select from stealing the keystrokes (Escape still closes).
          if (e.key !== 'Escape') e.stopPropagation();
        }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              {(term || results !== null) && (
                <IconButton size="small" aria-label="Clear search" onClick={clearSearch}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              )}
              <IconButton size="small" aria-label="Search lots" onClick={runSearch} disabled={busy}>
                {busy ? <CircularProgress size={16} /> : <SearchIcon fontSize="small" />}
              </IconButton>
            </InputAdornment>
          )
        }}
      />
    </ListSubheader>
  ];
  if (!shownCount) {
    items.push(
      <MenuItem key="__none" value="__none" disabled sx={{ whiteSpace: 'normal' }}>
        {results !== null
          ? `No lots found for "${searchedFor}"`
          : (term.trim() ? 'No match in this list — press Enter or 🔍 to search further' : 'No lots — use the search above')}
      </MenuItem>
    );
  }
  let lastGroup = null;
  list.forEach(({ o, group }) => {
    if (group && group !== lastGroup) {
      items.push(
        <ListSubheader
          key={`g:${group}`}
          disableSticky
          sx={{ lineHeight: '28px', fontSize: '0.72rem', bgcolor: 'background.paper', backgroundImage: 'none', color: 'text.secondary' }}
        >
          {group}
        </ListSubheader>
      );
      lastGroup = group;
    }
    items.push(
      <MenuItem key={String(o._id)} value={String(o._id)} sx={{ whiteSpace: 'normal' }}>
        {renderOption ? renderOption(o) : getLabel(o)}
      </MenuItem>
    );
  });

  const empty = <Typography variant="body2" color="text.secondary">{placeholder}</Typography>;

  return (
    <TextField
      select
      variant="standard"
      size="small"
      fullWidth
      disabled={disabled}
      value={multiple ? (value || []).map(String) : (value ? String(value) : '')}
      onChange={(e) => {
        const v = e.target.value;
        if (multiple) {
          const ids = (typeof v === 'string' ? v.split(',') : v).filter((id) => id && id !== '__none');
          if (onChange) onChange(ids.map((id) => byId.get(String(id))).filter(Boolean));
        } else if (v && v !== '__none' && onChange) {
          onChange(byId.get(String(v)) || null);
        }
      }}
      SelectProps={{
        multiple,
        displayEmpty: true,
        renderValue: (sel) => {
          if (multiple) {
            if (!sel || !sel.length) return empty;
            return (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {sel.map((id) => <Chip key={id} size="small" label={getLabel(byId.get(String(id)) || { lotNumber: id })} />)}
              </Box>
            );
          }
          return sel ? getLabel(byId.get(String(sel)) || {}) : empty;
        },
        // Opens right under the field, left-aligned, compact — stays over the invoice form — and
        // uses the form's own surface colour (a Select menu otherwise renders on a darker paper).
        MenuProps: {
          autoFocus: false,
          variant: 'menu',
          anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
          transformOrigin: { vertical: 'top', horizontal: 'left' },
          PaperProps: {
            sx: {
              maxHeight: 360,
              minWidth: 340,
              maxWidth: 480,
              bgcolor: 'background.paper',
              backgroundImage: 'none'
            },
            style: { backgroundColor: paperBg, backgroundImage: 'none' }
          },
          MenuListProps: { sx: { pt: 0 } }
        }
      }}
    >
      {items}
    </TextField>
  );
}
