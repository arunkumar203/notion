'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { FiSearch, FiX, FiBook, FiFolder, FiFileText, FiLayers } from 'react-icons/fi';
import { useNotebook } from '@/context/NotebookContext';

interface SearchResult {
    id: string;
    name: string;
    type: 'notebook' | 'section' | 'topic' | 'page';
    parentId?: string;
    parentName?: string;
    notebookId?: string;
    notebookName?: string;
    sectionId?: string;
    sectionName?: string;
    topicId?: string;
    topicName?: string;
}

interface GlobalSearchProps {
    onNavigate: (result: SearchResult) => void;
}

export default function GlobalSearch({ onNavigate }: GlobalSearchProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const searchRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const searchCounterRef = useRef(0);
    const { globalSearch } = useNotebook();

    // Search function using global search with race condition prevention
    const performSearch = useCallback(async (searchQuery: string) => {
        if (!searchQuery.trim()) {
            setResults([]);
            setIsLoading(false);
            return;
        }

        // Increment search counter to track this specific search request
        const currentSearchId = ++searchCounterRef.current;
        setIsLoading(true);

        try {
            const searchData = await globalSearch(searchQuery);

            // Check if this is still the latest search request
            if (currentSearchId !== searchCounterRef.current) {
                // This search is outdated, ignore the results
                return;
            }

            const searchResults: SearchResult[] = [];

            // Add notebooks
            searchData.notebooks.forEach(notebook => {
                searchResults.push({
                    id: notebook.id,
                    name: notebook.name,
                    type: 'notebook'
                });
            });

            // Add sections
            searchData.sections.forEach(section => {
                searchResults.push({
                    id: section.id,
                    name: section.name,
                    type: 'section',
                    notebookId: section.notebookId,
                    notebookName: section.notebookName
                });
            });

            // Add topics
            searchData.topics.forEach(topic => {
                searchResults.push({
                    id: topic.id,
                    name: topic.name,
                    type: 'topic',
                    sectionId: topic.sectionId,
                    sectionName: topic.sectionName,
                    notebookId: topic.notebookId,
                    notebookName: topic.notebookName
                });
            });

            // Add pages (now from all topics!)
            searchData.pages.forEach(page => {
                searchResults.push({
                    id: page.id,
                    name: page.name,
                    type: 'page',
                    topicId: page.topicId,
                    topicName: page.topicName,
                    sectionId: page.sectionId,
                    sectionName: page.sectionName,
                    notebookId: page.notebookId,
                    notebookName: page.notebookName
                });
            });

            // Sort results by type priority: notebooks, sections, topics, pages
            const typeOrder = { notebook: 0, section: 1, topic: 2, page: 3 };
            searchResults.sort((a, b) => {
                const typeComparison = typeOrder[a.type] - typeOrder[b.type];
                if (typeComparison !== 0) return typeComparison;
                return a.name.localeCompare(b.name);
            });

            setResults(searchResults.slice(0, 10)); // Limit to 10 results
        } catch (error) {
            console.error('Error performing search:', error);
            // Only clear results if this is still the latest search
            if (currentSearchId === searchCounterRef.current) {
                setResults([]);
            }
        } finally {
            // Only stop loading if this is still the latest search
            if (currentSearchId === searchCounterRef.current) {
                setIsLoading(false);
            }
        }
    }, [globalSearch]);

    // Handle search input change
    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            setIsLoading(false);
            return;
        }

        // Set loading immediately when query changes
        setIsLoading(true);
        
        const timeoutId = setTimeout(async () => {
            await performSearch(query);
        }, 150); // Debounce search

        return () => clearTimeout(timeoutId);
    }, [query, performSearch]);

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev =>
                    prev < results.length - 1 ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && results[selectedIndex]) {
                    handleResultClick(results[selectedIndex]);
                }
                break;
            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                setQuery('');
                setSelectedIndex(-1);
                inputRef.current?.blur();
                break;
        }
    };

    // Handle result click
    const handleResultClick = (result: SearchResult) => {
        onNavigate(result);
        setIsOpen(false);
        setQuery('');
        setSelectedIndex(-1);
        inputRef.current?.blur();
    };

    // Handle click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSelectedIndex(-1);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Get icon for result type
    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'notebook': return FiBook;
            case 'section': return FiLayers;
            case 'topic': return FiFolder;
            case 'page': return FiFileText;
            default: return FiFileText;
        }
    };

    // Get type label
    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'notebook': return 'Notebook';
            case 'section': return 'Section';
            case 'topic': return 'Topic';
            case 'page': return 'Page';
            default: return 'Item';
        }
    };

    return (
        <div ref={searchRef} className="relative flex-1 max-w-md mx-4">
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FiSearch className="h-4 w-4 text-gray-400" />
                </div>
                <input
                    ref={inputRef}
                    type="text"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="none"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        if (e.target.value.trim()) {
                            setIsOpen(true);
                        } else {
                            setIsOpen(false);
                        }
                        setSelectedIndex(-1);
                    }}
                    onFocus={() => {
                        if (query.trim()) setIsOpen(true);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Search notebooks, sections, topics, pages..."
                    className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
                {query && (
                    <button
                        onClick={() => {
                            setQuery('');
                            setResults([]);
                            setIsOpen(false);
                            setSelectedIndex(-1);
                        }}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                        <FiX className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                    </button>
                )}
            </div>

            {/* Search Results Dropdown */}
            {isOpen && (isLoading || results.length > 0) && (
                <div className="absolute z-[60] mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-96 overflow-y-auto">
                    {isLoading ? (
                        <div className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600 mr-2"></div>
                                <span className="text-sm text-gray-500">Searching...</span>
                            </div>
                        </div>
                    ) : (
                        results.map((result, index) => {
                            const Icon = getTypeIcon(result.type);
                            const isSelected = index === selectedIndex;

                            return (
                                <button
                                    key={`${result.type}-${result.id}`}
                                    onClick={() => handleResultClick(result)}
                                    className={`w-full px-4 py-3 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none border-b border-gray-100 last:border-b-0 ${isSelected ? 'bg-indigo-50' : ''
                                        }`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center min-w-0 flex-1">
                                            <Icon className="h-4 w-4 text-gray-400 mr-3 flex-shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-medium text-gray-900 truncate">
                                                    {result.name}
                                                </div>
                                                {result.type !== 'notebook' && (
                                                    <div className="text-xs text-gray-500 truncate mt-1">
                                                        {result.type === 'section' && `in ${result.notebookName}`}
                                                        {result.type === 'topic' && `in ${result.notebookName} → ${result.sectionName}`}
                                                        {result.type === 'page' && `in ${result.notebookName} → ${result.sectionName} → ${result.topicName}`}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="ml-2 flex-shrink-0">
                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                                {getTypeLabel(result.type)}
                                            </span>
                                        </div>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            )}

            {/* No Results */}
            {isOpen && query.trim() && !isLoading && results.length === 0 && (
                <div className="absolute z-[60] mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg">
                    <div className="px-4 py-3 text-sm text-gray-500 text-center">
                        No results found for "{query}"
                    </div>
                </div>
            )}
        </div>
    );
}