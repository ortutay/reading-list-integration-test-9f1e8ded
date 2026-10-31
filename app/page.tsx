'use client';

import { useEffect, useRef, useState } from 'react';
import './globals.css';

type Book = { id: string; title: string; read: boolean };
type Filter = 'all' | 'unread' | 'read';
type Deletion = { book: Book; index: number };
const STORAGE_KEY = 'reading-list.v1';

function decodeBackup(text: string): Book[] {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('books' in value) || !Array.isArray(value.books)) {
    throw new Error('Expected a version 1 reading-list backup.');
  }
  const ids = new Set<string>();
  return value.books.map((item: unknown) => {
    if (!item || typeof item !== 'object' || !('id' in item) || typeof item.id !== 'string' || !item.id.trim() || !('title' in item) || typeof item.title !== 'string' || !item.title.trim() || !('read' in item) || typeof item.read !== 'boolean' || ids.has(item.id)) {
      throw new Error('Each book must have a unique ID, a nonblank title, and a read status.');
    }
    ids.add(item.id);
    return { id: item.id, title: item.title.trim(), read: item.read };
  });
}

function encodeBackup(books: Book[]) {
  return JSON.stringify({ version: 1, books }, null, 2);
}

export default function ReadingList() {
  const [books, setBooks] = useState<Book[]>([]);
  const [ready, setReady] = useState(false);
  const [warning, setWarning] = useState('');
  const [notice, setNotice] = useState('');
  const [title, setTitle] = useState('');
  const [addError, setAddError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editError, setEditError] = useState('');
  const [deleted, setDeleted] = useState<Deletion | null>(null);
  const [pendingImport, setPendingImport] = useState<Book[] | null>(null);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const addInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        try {
          setBooks(decodeBackup(saved));
        } catch {
          setWarning('Saved data could not be loaded. It has not been overwritten. Import a valid backup, or add a book to start a new list.');
        }
      }
    } catch {
      setWarning('Browser storage is unavailable. You can use this list, but changes may be lost when you leave. Export a backup to keep them.');
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!deleted) return;
    const timer = window.setTimeout(() => setDeleted(null), 10000);
    return () => window.clearTimeout(timer);
  }, [deleted]);

  function commit(next: Book[]) {
    setBooks(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, encodeBackup(next));
      setWarning('');
    } catch {
      setWarning('Changes are only in memory: browser storage is unavailable or full. Export a backup before leaving this page.');
    }
  }

  function addBook() {
    const clean = title.trim();
    if (!clean) {
      setAddError('Enter a book title, not just spaces.');
      addInput.current?.focus();
      return;
    }
    let id: string;
    do {
      id = typeof window.crypto?.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    } while (books.some(book => book.id === id));
    commit([...books, { id, title: clean, read: false }]);
    setTitle('');
    setAddError('');
    setNotice(`Added “${clean}”.`);
    addInput.current?.focus();
  }

  function saveEdit(id: string) {
    const clean = editTitle.trim();
    if (!clean) {
      setEditError('The title cannot be blank.');
      return;
    }
    commit(books.map(book => book.id === id ? { ...book, title: clean } : book));
    setEditing(null);
    setEditError('');
    setNotice('Title updated.');
  }

  function removeBook(book: Book) {
    setDeleted({ book, index: books.findIndex(item => item.id === book.id) });
    commit(books.filter(item => item.id !== book.id));
    if (editing === book.id) setEditing(null);
    setNotice(`Deleted “${book.title}”. Undo is available for 10 seconds.`);
  }

  function undoDelete() {
    if (!deleted) return;
    const next = [...books];
    next.splice(Math.min(deleted.index, next.length), 0, deleted.book);
    commit(next);
    setDeleted(null);
    setNotice('Book restored.');
  }

  function exportBooks() {
    try {
      const blob = new Blob([encodeBackup(books)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `reading-list-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Backup download requested. Keep the JSON file to restore your list.');
    } catch {
      setNotice('The backup download could not be created in this browser.');
    }
  }

  async function readImport(file: File) {
    setImporting(true);
    setImportError('');
    setPendingImport(null);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Choose a JSON backup smaller than 5 MB.');
      const imported = decodeBackup(await file.text());
      setPendingImport(imported);
    } catch (error) {
      const detail = error instanceof SyntaxError ? 'The file is not valid JSON.' : error instanceof Error ? error.message : 'The file could not be read.';
      setImportError(`Import failed. ${detail} Your list has not changed.`);
    } finally {
      setImporting(false);
    }
  }

  const readCount = books.filter(book => book.read).length;
  const visible = books.filter(book =>
    (filter === 'all' || (filter === 'read' ? book.read : !book.read)) &&
    book.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  );

  return (
    <main className="shell">
      <header className="page-header">
        <div className="eyebrow"><span className="brand-mark" aria-hidden="true">R</span> YOUR PERSONAL BOOKSHELF</div>
        <h1>A little reading list.</h1>
        <p className="intro">Good books, one at a time. Keep track of what’s next.</p>
      </header>

      {warning && <div className="warning" role="alert">{warning}</div>}

      <section className="card add-card" aria-labelledby="add-heading">
        <h2 id="add-heading">What will you read next?</h2>
        <form onSubmit={event => { event.preventDefault(); if (ready) addBook(); }} noValidate>
          <label htmlFor="new-title">Book title</label>
          <div className="input-row">
            <input ref={addInput} id="new-title" value={title} onChange={event => { setTitle(event.target.value); setAddError(''); }} placeholder="e.g. The Left Hand of Darkness" disabled={!ready} aria-invalid={Boolean(addError)} aria-describedby={addError ? 'add-error' : undefined} autoComplete="off" />
            <button className="primary" type="submit" disabled={!ready}>+ Add book</button>
          </div>
          {addError && <p className="error" id="add-error" role="alert">{addError}</p>}
        </form>
      </section>

      <section className="card list-card" aria-labelledby="list-heading" aria-busy={!ready}>
        <div className="section-heading">
          <h2 id="list-heading">Your bookshelf <span className="count">{books.length}</span></h2>
          <span className="muted">{readCount} read · {books.length - readCount} to go</span>
        </div>
        <div className="tools">
          <div className="filters" role="group" aria-label="Filter by read status">
            {(['all', 'unread', 'read'] as Filter[]).map(option => (
              <button type="button" key={option} aria-pressed={filter === option} onClick={() => setFilter(option)}>{option === 'all' ? 'All' : option === 'unread' ? 'Unread' : 'Read'}</button>
            ))}
          </div>
          <div className="search-field">
            <label htmlFor="search">Search titles</label>
            <input id="search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a book…" />
          </div>
        </div>

        {!ready ? <div className="empty">Loading your bookshelf…</div> : books.length === 0 ? (
          <div className="empty"><span className="empty-symbol" aria-hidden="true">≡</span><h3>A fresh page.</h3><p>Your bookshelf is empty. Add your first title above.</p></div>
        ) : visible.length === 0 ? (
          <div className="empty"><h3>No matching books.</h3><p>Try a different title or read-status filter.</p><button type="button" onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</button></div>
        ) : (
          <ul className="books">
            {visible.map(book => (
              <li key={book.id} className="book">
                <span className={`book-icon ${book.read ? 'finished' : ''}`} aria-hidden="true">{book.read ? '✓' : '▤'}</span>
                {editing === book.id ? (
                  <form className="edit-form" onSubmit={event => { event.preventDefault(); saveEdit(book.id); }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setEditing(null); setEditError(''); } }} noValidate>
                    <label htmlFor={`edit-${book.id}`}>Edit book title</label>
                    <input id={`edit-${book.id}`} value={editTitle} onChange={event => { setEditTitle(event.target.value); setEditError(''); }} autoFocus aria-invalid={Boolean(editError)} aria-describedby={editError ? 'edit-error' : undefined} />
                    {editError && <p id="edit-error" className="error" role="alert">{editError}</p>}
                    <div className="edit-actions"><button className="primary" type="submit">Save title</button><button type="button" onClick={() => { setEditing(null); setEditError(''); }}>Cancel</button></div>
                  </form>
                ) : (
                  <>
                    <div className="book-info"><h3>{book.title}</h3><span className={`status ${book.read ? 'is-read' : ''}`}>{book.read ? 'Read' : 'Unread'}</span></div>
                    <div className="book-actions">
                      <button type="button" className="toggle" aria-label={`Mark “${book.title}” as ${book.read ? 'unread' : 'read'}`} onClick={() => { commit(books.map(item => item.id === book.id ? { ...item, read: !item.read } : item)); setNotice(`Marked “${book.title}” as ${book.read ? 'unread' : 'read'}.`); }}>{book.read ? 'Mark unread' : 'Mark read'}</button>
                      <button type="button" aria-label={`Edit “${book.title}”`} onClick={() => { setEditing(book.id); setEditTitle(book.title); setEditError(''); }}>Edit</button>
                      <button type="button" className="danger" aria-label={`Delete “${book.title}”`} onClick={() => removeBook(book)}>Delete</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {ready && books.length > 0 && <div className="list-foot">Showing {visible.length} of {books.length} books</div>}
      </section>

      <div className="feedback">
        <p role="status" aria-live="polite">{notice}</p>
        {deleted && <button className="undo" type="button" onClick={undoDelete}>Undo last deletion</button>}
      </div>

      <section className="backup" aria-labelledby="backup-heading">
        <div><h2 id="backup-heading">Keep a copy.</h2><p>Export a JSON backup, or restore one from your device.</p></div>
        <div className="backup-actions">
          <button type="button" onClick={exportBooks} disabled={!ready}>Export JSON</button>
          <div className="import-field"><label htmlFor="import-file">Import JSON <span className="muted">(max. 5 MB)</span></label><input id="import-file" type="file" accept=".json,application/json" disabled={!ready || importing} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void readImport(file); }} /></div>
        </div>
        {importing && <p role="status">Checking backup…</p>}
        {importError && <p className="error" role="alert">{importError}</p>}
        {pendingImport !== null && (
          <div className="import-confirm" role="region" aria-label="Confirm backup restore">
            <p><strong>Replace your bookshelf?</strong> This backup contains {pendingImport.length} books and will replace your current {books.length}. Export your current list first if you want to keep it. This replacement cannot be undone.</p>
            <div className="edit-actions"><button className="primary" type="button" onClick={() => { commit(pendingImport); setPendingImport(null); setDeleted(null); setEditing(null); setFilter('all'); setSearch(''); setNotice('Backup restored.'); }}>Replace list</button><button type="button" onClick={() => setPendingImport(null)}>Cancel import</button></div>
          </div>
        )}
      </section>
      <footer>Just you and your books. Stored in this browser, not in the cloud.</footer>
    </main>
  );
}
