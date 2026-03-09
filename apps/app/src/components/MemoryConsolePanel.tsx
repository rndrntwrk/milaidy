import React, { useState, useEffect } from 'react';
import { SciFiPanel } from './ui/SciFiPanel.js';
import { GlowingText } from './ui/GlowingText.js';
import { client, type KnowledgeSearchResult } from '../api-client.js';

export function MemoryConsolePanel() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<KnowledgeSearchResult[]>([]);
    const [searching, setSearching] = useState(false);

    // Quick debounce
    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        const timeoutId = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await client.searchKnowledge(query, {
                    threshold: 0.3,
                    limit: 5,
                });
                setResults(res.results);
            } catch (err) {
                console.error("Search failed", err);
            } finally {
                setSearching(false);
            }
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [query]);

    return (
        <SciFiPanel variant="glass" className="flex-1 flex flex-col min-h-[16rem]">
            <div className="border-b border-accent/20 pb-2 mb-4 flex justify-between items-center">
                <GlowingText className="text-sm tracking-widest text-accent">MEMORY CONSOLE</GlowingText>
                {searching && <span className="text-xs text-accent animate-pulse font-mono">SEARCHING...</span>}
            </div>

            <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                <div className="relative shrink-0">
                    <input
                        type="text"
                        placeholder="SEARCH VECTOR DB..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="w-full bg-bg border border-accent/30 rounded p-2 text-xs font-mono text-accent placeholder:text-muted focus:outline-none focus:border-accent"
                    />
                </div>
                <div className="space-y-2 flex-1 overflow-y-auto">
                    {results.length === 0 && query.trim() && !searching && (
                        <div className="text-xs text-muted font-mono text-center mt-4">NO MATCHES FOUND.</div>
                    )}
                    {results.map((r, i) => (
                        <div key={`${r.id}-${i}`} className="p-2 border border-border rounded text-xs text-muted font-mono hover:bg-accent/10 cursor-pointer transition-colors group">
                            <div className="flex justify-between mb-1">
                                <span className="text-accent truncate pr-2">{r.documentTitle || "Unknown"}</span>
                                <span className="text-[10px] text-accent/70">{(r.similarity * 100).toFixed(0)}%</span>
                            </div>
                            <div className="line-clamp-2 group-hover:line-clamp-none leading-relaxed">{r.text}</div>
                        </div>
                    ))}
                </div>
            </div>
        </SciFiPanel>
    );
}
