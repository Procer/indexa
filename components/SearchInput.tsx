"use client";

import { KeyboardEvent, useState, useEffect, useRef } from "react";

const EXAMPLES = [
  "notebook para llevar a la facu y ver series",
  "PC gaming económica para Fortnite, hasta $400k",
  "tablet para mis hijos de 8 años",
  "notebook liviana para trabajar, pago en cuotas",
  "celular con buena cámara, hasta $200k en efectivo",
  "PC para editar videos 1080p, pago en efectivo",
  "notebook para programar, que sea rápida",
];

function useTypewriter(examples: string[], active: boolean): string {
  const [text, setText] = useState("");
  const state = useRef({ idx: 0, char: 0, phase: "typing" as "typing" | "pause" | "erasing" });

  useEffect(() => {
    if (!active) {
      setText("");
      return;
    }

    let tid: ReturnType<typeof setTimeout>;

    const tick = () => {
      const s = state.current;
      const cur = examples[s.idx];

      if (s.phase === "typing") {
        if (s.char < cur.length) {
          s.char++;
          setText(cur.slice(0, s.char));
          tid = setTimeout(tick, 42);
        } else {
          s.phase = "pause";
          tid = setTimeout(tick, 2200);
        }
      } else if (s.phase === "pause") {
        s.phase = "erasing";
        tid = setTimeout(tick, 0);
      } else {
        if (s.char > 0) {
          s.char--;
          setText(cur.slice(0, s.char));
          tid = setTimeout(tick, 18);
        } else {
          s.idx = (s.idx + 1) % examples.length;
          s.phase = "typing";
          tid = setTimeout(tick, 400);
        }
      }
    };

    tid = setTimeout(tick, 700);
    return () => clearTimeout(tid);
  }, [active, examples]);

  return text;
}

interface SearchInputProps {
  onSearch: (input: string) => void;
  loading?: boolean;
  defaultValue?: string;
  compact?: boolean;
}

export function SearchInput({
  onSearch,
  loading = false,
  defaultValue = "",
  compact = false,
}: SearchInputProps) {
  const [value, setValue] = useState(defaultValue);
  const [focused, setFocused] = useState(false);
  const isAnimating = !compact && !value && !focused && !loading;

  useEffect(() => {
    if (defaultValue) setValue(defaultValue);
  }, [defaultValue]);
  const typewriterText = useTypewriter(EXAMPLES, isAnimating);

  const handleSubmit = () => {
    if (value.trim() && !loading) {
      onSearch(value.trim());
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="w-full"
    >
      <div
        className={`search-wrapper relative flex items-center gap-2 rounded-xl border border-gray-200 bg-white shadow-sm hover:border-gray-300 hover:shadow-md ${compact ? "p-2" : "p-4"}`}
      >
        {/* Animated typewriter placeholder */}
        {isAnimating && typewriterText && (
          <div
            className="pointer-events-none absolute left-4 top-4 right-14 select-none"
            aria-hidden
          >
            <span className="text-base leading-relaxed text-gray-400">
              {typewriterText}
            </span>
            <span className="ml-px inline-block h-[18px] w-[2px] animate-blink bg-gray-400 align-middle" />
          </div>
        )}

        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={
            compact
              ? "¿Qué buscás?"
              : focused && !value
              ? "¿Qué necesitás? Contanos para qué lo vas a usar y cuánto podés invertir"
              : ""
          }
          rows={compact ? 1 : 2}
          disabled={loading}
          className={`w-full resize-none bg-transparent leading-relaxed text-gray-900 placeholder-gray-400 outline-none disabled:opacity-60 ${
            compact ? "text-sm" : "text-base"
          }`}
        />

        <button
          type="submit"
          disabled={loading || !value.trim()}
          onClick={() => {
            if (value.trim() && !loading) {
              // ripple feel via active: CSS handled by Tailwind
            }
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-md shadow-blue-200 transition-all duration-150 hover:bg-blue-700 hover:shadow-blue-300 active:scale-90 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          aria-label="Buscar"
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          )}
        </button>
      </div>

      {!compact && (
        <p className="mt-2 text-center text-xs text-gray-400">
          Enter para buscar · Shift+Enter para nueva línea
        </p>
      )}
    </form>
  );
}
