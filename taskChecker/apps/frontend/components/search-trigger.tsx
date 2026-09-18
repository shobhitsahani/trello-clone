"use client";

import { SearchIcon } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

/* ⌘K palette trigger built on the InputGroup + Kbd pattern.
   Looks like a search field (so it inherits the `.st-search` Trello-bar
   styling) but focuses/opens the command palette instead of typing. */
export function PaletteSearchTrigger({
  onOpen,
  className,
}: {
  onOpen: () => void;
  className?: string;
}) {
  return (
    <InputGroup
      variant="search"
      onClick={onOpen}
      title="Search (⌘K)"
      className={cn(
        "st-search cursor-pointer [&_[data-slot=input-group-control]]:cursor-pointer",
        className
      )}
    >
      <InputGroupAddon>
        <SearchIcon aria-hidden />
      </InputGroupAddon>
      <InputGroupInput
        placeholder="Search tasks, comments, people…"
        aria-label="Search tasks, comments, people"
        readOnly
        tabIndex={-1}
        onFocus={onOpen}
      />
      <InputGroupAddon align="inline-end">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </InputGroupAddon>
    </InputGroup>
  );
}
