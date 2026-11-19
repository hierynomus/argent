/** Sum of money amounts in whole cents, so that 0.1 + 0.2 is 0.3 and not 0.30000000000000004. */
export const sumCents = (amounts: number[]): number => amounts.reduce((total, amount) => total + Math.round(amount * 100), 0) / 100
