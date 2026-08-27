"use client";

import { useState } from "react";
import { formatArs, getCashTiers, getMonthlyTiers, numberToSpanishPesos } from "@/lib/domain/budgetTiers";
import type { ProductCategory } from "@/types";

type PaymentType = "installments" | "cash";
type Step = "collapsed" | "type" | "installment_amount" | "installment_count" | "cash_min" | "cash_max";

const INSTALLMENT_COUNTS = [
  { label: "3 cuotas", value: "3" },
  { label: "6 cuotas", value: "6" },
  { label: "12 cuotas", value: "12" },
  { label: "18 cuotas", value: "18" },
  { label: "24 cuotas", value: "24" },
  { label: "Indiferente", value: null },
];

interface BudgetPickerProps {
  onSelect: (budgetText: string) => void;
  startOpen?: boolean;
  category?: ProductCategory | null;
}

export function BudgetPicker({ onSelect, startOpen = true, category = null }: BudgetPickerProps) {
  const installmentAmounts = getMonthlyTiers(category).map((t) => ({
    label: t.label,
    caption: `hasta ${formatArs(t.maxCash)}/mes`,
    value: `${numberToSpanishPesos(t.maxCash)} por mes`,
  }));
  const cashTiers = getCashTiers(category);
  // Botones de piso: mismos montos que las bandas de categoría, pero con
  // etiqueta de monto plano (las etiquetas cualitativas como "Lo más
  // accesible" no tienen sentido como mínimo) + "Sin mínimo".
  const minOptions: { label: string; value: number | null }[] = [
    { label: "Sin mínimo", value: null },
    ...cashTiers.slice(0, 3).map((t) => ({ label: formatArs(t.maxCash), value: t.maxCash })),
  ];

  const [step, setStep] = useState<Step>(startOpen ? "type" : "collapsed");
  const [selectedAmount, setSelectedAmount] = useState<string | null>(null);
  const [selectedMin, setSelectedMin] = useState<number | null>(null);

  const reset = () => {
    setStep("collapsed");
    setSelectedAmount(null);
    setSelectedMin(null);
  };

  const handleTypeSelect = (type: PaymentType) => {
    // El flujo "al contado" arranca directo pidiendo el techo (cash_max), no
    // el piso (cash_min) — un usuario real tocó un monto en "¿Desde cuánto?"
    // pensando que era el techo, y como ese valor queda como PISO, el paso
    // siguiente solo mostraba opciones por ENCIMA (se quedó viendo una sola
    // opción cara). El piso ahora es opcional y se pide aparte desde cash_max.
    setStep(type === "installments" ? "installment_amount" : "cash_max");
  };

  const handleAmountSelect = (amountValue: string) => {
    setSelectedAmount(amountValue);
    setStep("installment_count");
  };

  const handleCountSelect = (countValue: string | null) => {
    if (!selectedAmount) return;
    const query = countValue
      ? `hasta ${selectedAmount} en ${countValue} cuotas`
      : `hasta ${selectedAmount} en cuotas`;
    onSelect(query);
  };

  const handleMinSelect = (min: number | null) => {
    setSelectedMin(min);
    setStep("cash_max");
  };

  const handleMaxSelect = (max: number) => {
    const query =
      selectedMin && selectedMin < max
        ? `entre ${numberToSpanishPesos(selectedMin)} y ${numberToSpanishPesos(max)} al contado`
        : `hasta ${numberToSpanishPesos(max)} al contado`;
    onSelect(query);
  };

  const goBack = () => {
    if (step === "installment_amount" || step === "cash_max") setStep("type");
    if (step === "installment_count") setStep("installment_amount");
    // cash_min ahora es un paso opcional que solo se llega a través de
    // cash_max ("+ Agregar un piso mínimo"), así que vuelve ahí, no a "type".
    if (step === "cash_min") setStep("cash_max");
  };

  const stepTitle: Record<Step, string> = {
    collapsed: "",
    type: "¿Cómo querés pagar?",
    installment_amount: "¿Hasta cuánto querés pagar por mes?",
    installment_count: "¿A cuántas cuotas?",
    cash_min: "¿Desde cuánto? (opcional)",
    cash_max: "¿Hasta cuánto querés gastar en total?",
  };

  if (step === "collapsed") {
    return (
      <div className="gathering-glass-panel mb-5 flex items-center justify-between rounded-2xl px-4 py-3">
        <span className="font-brand text-sm text-gathering-on-surface-variant">¿Querés filtrar por presupuesto?</span>
        <button
          onClick={() => setStep("type")}
          className="gathering-btn-primary-gradient rounded-full px-4 py-1.5 font-brand text-sm font-medium text-white active:scale-95"
        >
          + Agregar filtro
        </button>
      </div>
    );
  }

  return (
    <div className="gathering-glass-panel mb-5 rounded-2xl p-4">
      {/* Header with back + title + close */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {step !== "type" && (
            <button
              onClick={goBack}
              className="rounded-full px-1.5 py-0.5 text-gathering-primary-fixed-dim hover:bg-gathering-primary/10"
              aria-label="Volver"
            >
              ←
            </button>
          )}
          <p className="font-brand text-sm font-semibold text-gathering-on-surface">{stepTitle[step]}</p>
        </div>
        <button
          onClick={reset}
          className="rounded-full p-1 text-gathering-on-surface-variant hover:bg-black/5 hover:text-gathering-on-surface"
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>

      {/* Step indicator for cuotas flow */}
      {(step === "installment_amount" || step === "installment_count") && (
        <div className="mb-3 flex items-center gap-1.5">
          <div className={`h-1.5 w-6 rounded-full ${step === "installment_amount" ? "bg-gathering-primary-fixed-dim" : "bg-gathering-surface-variant"}`} />
          <div className={`h-1.5 w-6 rounded-full ${step === "installment_count" ? "bg-gathering-primary-fixed-dim" : "bg-gathering-surface-variant"}`} />
        </div>
      )}

      {/* STEP: type */}
      {step === "type" && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleTypeSelect("installments")}
            className="gathering-interactive-card group flex flex-col items-center gap-2 rounded-2xl p-4 text-center active:scale-95"
          >
            <span className="text-3xl">💳</span>
            <span className="font-brand text-sm font-medium text-gathering-on-surface group-hover:text-gathering-primary-fixed-dim">En cuotas</span>
            <span className="font-brand text-xs text-gathering-on-surface-variant">Pagás por mes</span>
          </button>
          <button
            onClick={() => handleTypeSelect("cash")}
            className="gathering-interactive-card group flex flex-col items-center gap-2 rounded-2xl p-4 text-center active:scale-95"
          >
            <span className="text-3xl">💵</span>
            <span className="font-brand text-sm font-medium text-gathering-on-surface group-hover:text-gathering-primary-fixed-dim">Al contado</span>
            <span className="font-brand text-xs text-gathering-on-surface-variant">Precio total</span>
          </button>
        </div>
      )}

      {/* STEP: installment amount */}
      {step === "installment_amount" && (
        <div className="flex flex-wrap gap-2">
          {installmentAmounts.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleAmountSelect(opt.value)}
              className="gathering-interactive-card flex flex-col items-start rounded-2xl px-4 py-2 text-left active:scale-95"
            >
              <span className="font-brand text-sm font-medium text-gathering-primary-fixed-dim">{opt.label}</span>
              <span className="font-brand text-xs text-gathering-on-surface-variant">{opt.caption}</span>
            </button>
          ))}
        </div>
      )}

      {/* STEP: installment count */}
      {step === "installment_count" && (
        <>
          {selectedAmount && (
            <p className="mb-2 font-brand text-xs text-gathering-on-surface-variant">
              Hasta {selectedAmount}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {INSTALLMENT_COUNTS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => handleCountSelect(opt.value)}
                className="gathering-interactive-card rounded-full px-4 py-2 font-brand text-sm font-medium text-gathering-on-surface active:scale-95"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* STEP: cash minimum (piso, opcional) */}
      {step === "cash_min" && (
        <div className="flex flex-wrap gap-2">
          {minOptions.map((opt) => (
            <button
              key={opt.label}
              onClick={() => handleMinSelect(opt.value)}
              className="gathering-interactive-card rounded-full px-4 py-2 font-brand text-sm font-medium text-gathering-on-surface active:scale-95"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* STEP: cash maximum (techo) — primer paso del flujo contado */}
      {step === "cash_max" && (
        <>
          {selectedMin ? (
            <p className="mb-2 font-brand text-xs text-gathering-on-surface-variant">
              Desde {formatArs(selectedMin)} ·{" "}
              <button onClick={() => setStep("cash_min")} className="underline hover:text-gathering-primary-fixed-dim">
                cambiar
              </button>
            </p>
          ) : (
            <button
              onClick={() => setStep("cash_min")}
              className="mb-2 font-brand text-xs text-gathering-primary-fixed-dim underline"
            >
              + Poner también un mínimo
            </button>
          )}
          <div className="flex flex-wrap gap-2">
            {cashTiers
              .filter((t) => !selectedMin || t.maxCash > selectedMin)
              .map((t) => (
                <button
                  key={t.key}
                  onClick={() => handleMaxSelect(t.maxCash)}
                  className="gathering-interactive-card flex flex-col items-start rounded-2xl px-4 py-2 text-left active:scale-95"
                >
                  <span className="font-brand text-sm font-medium text-gathering-primary-fixed-dim">{t.label}</span>
                  <span className="font-brand text-xs text-gathering-on-surface-variant">hasta {formatArs(t.maxCash)}</span>
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
