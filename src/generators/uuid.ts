import { randomUUID } from 'crypto';

/**
 * Generate a UUID (lowercase with hyphens)
 * Example: 550e8400-e29b-41d4-a716-446655440000
 */
export function generateUuid(): string {
	return randomUUID();
}

/**
 * Generate a GUID (uppercase with hyphens)
 * Example: 550E8400-E29B-41D4-A716-446655440000
 */
export function generateGuid(): string {
	return randomUUID().toUpperCase();
}

/**
 * Generate a UUID without hyphens (compact format, lowercase)
 * Example: 550e8400e29b41d4a716446655440000
 */
export function generateUuidCompact(): string {
	return randomUUID().replace(/-/g, '');
}

/**
 * Generate a GUID without hyphens (compact format, uppercase)
 * Example: 550E8400E29B41D4A716446655440000
 */
export function generateGuidCompact(): string {
	return randomUUID().replace(/-/g, '').toUpperCase();
}
