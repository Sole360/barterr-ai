// src/components/shared/SearchBar.tsx

import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { searchClient, ALGOLIA_INDEX } from "@/lib/algolia/config";
import type { AlgoliaHit } from "@/types";

interface SearchBarProps {
  onSelectPost: (postId: string) => void;
}

export const SearchBar = ({ onSelectPost }: SearchBarProps) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AlgoliaHit[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Run Algolia search when query changes
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const { results: searchResults } =
          await searchClient.search<AlgoliaHit>([
            {
              indexName: ALGOLIA_INDEX,
              params: {
                query,
                hitsPerPage: 8,
                attributesToRetrieve: [
                  "objectID",
                  "title",
                  "brand",
                  "styleId",
                  "productImageUrl",
                ],
              },
            },
          ]);

        if (
          Array.isArray(searchResults) &&
          searchResults[0] &&
          "hits" in searchResults[0]
        ) {
          setResults((searchResults[0] as { hits: AlgoliaHit[] }).hits);
        } else {
          setResults([]);
        }

        setIsOpen(true);
      } catch (error) {
        console.error("Algolia search error:", error);
        setResults([]);
        setIsOpen(false);
      } finally {
        setIsSearching(false);
      }
    }, 300); // debounce

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelectResult = (postId: string) => {
    onSelectPost(postId);
    setQuery("");
    setResults([]);
    setIsOpen(false);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setIsOpen(false);
  };

  return (
    <div ref={searchRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sneakers..."
          className="w-full pl-10 pr-10 py-2 bg-background text-foreground border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3366FF] focus:border-transparent placeholder:text-muted-foreground"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full mt-2 w-full bg-background rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.14)] border border-border max-h-96 overflow-y-auto z-50">
          {isSearching ? (
            <div className="p-4 text-center text-muted-foreground">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-[#3366FF]"></div>
            </div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No results found for "{query}"
            </div>
          ) : (
            <div className="py-1">
              {results.map((hit) => (
                <button
                  key={hit.objectID}
                  onClick={() => handleSelectResult(hit.objectID)}
                  className="w-full px-4 py-3 hover:bg-accent flex items-center gap-3 text-left transition-colors"
                >
                  <div className="w-12 h-12 flex-shrink-0 bg-white rounded-lg overflow-hidden border border-border/50">
                    <img
                      src={hit.productImageUrl}
                      alt={hit.title}
                      className="w-full h-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#3366FF] mb-0.5">
                      {hit.brand}
                    </p>
                    <p className="font-medium text-foreground text-sm truncate">
                      {hit.title}
                    </p>
                    {hit.styleId && (
                      <p className="text-xs text-muted-foreground">{hit.styleId}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
