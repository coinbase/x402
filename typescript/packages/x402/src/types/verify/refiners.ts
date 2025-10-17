// Refiners
export const isInteger = (value: string) => Number.isInteger(Number(value)) && Number(value) >= 0;
export const isBigInt = (value: string) => BigInt(value) >= 0n;
export const hasMaxLength = (maxLength: number) => (value: string) => value.length <= maxLength;
