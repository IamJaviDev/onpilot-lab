const eur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

/** Formatea un importe (number de display) como "45,00 €". */
export function formatEur(amount: number): string {
  return eur.format(amount);
}
