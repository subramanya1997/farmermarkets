'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

export function HeroSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter();
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      // We'll pass the search term as a URL parameter to the markets page
      router.push(`/markets?search=${encodeURIComponent(searchTerm.trim())}`);
    }
  };
  
  return (
    <form onSubmit={handleSearch} className="w-full max-w-md mx-auto">
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search for markets, cities, or states..."
          className="pl-9 pr-20 py-6 h-12 w-full bg-white dark:bg-zinc-900 border-2"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Button 
          type="submit" 
          className="absolute right-1 h-10"
          disabled={!searchTerm.trim()}
        >
          Search
        </Button>
      </div>
    </form>
  );
} 