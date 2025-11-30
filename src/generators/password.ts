import { randomBytes } from 'crypto';

/**
 * Password generation options
 */
export interface PasswordOptions {
	length: number;
	includeUppercase: boolean;
	includeLowercase: boolean;
	includeNumbers: boolean;
	includeSpecial: boolean;
	minNumbers: number;
	minSpecial: number;
	avoidAmbiguous: boolean;
}

/**
 * Default password options
 */
export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
	length: 14,
	includeUppercase: true,
	includeLowercase: true,
	includeNumbers: true,
	includeSpecial: true,
	minNumbers: 1,
	minSpecial: 1,
	avoidAmbiguous: false
};

// Character sets
const CHARSETS = {
	uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
	uppercaseNoAmbiguous: 'ABCDEFGHJKLMNPQRSTUVWXYZ', // No I, O
	lowercase: 'abcdefghijklmnopqrstuvwxyz',
	lowercaseNoAmbiguous: 'abcdefghjkmnpqrstuvwxyz', // No i, l, o
	numbers: '0123456789',
	numbersNoAmbiguous: '23456789', // No 0, 1
	special: '!@#$%^&*'
};

/**
 * Generate a password based on options
 */
export function generatePassword(options: PasswordOptions): string {
	let chars = '';
	const requiredChars: string[] = [];

	if (options.includeUppercase) {
		const set = options.avoidAmbiguous ? CHARSETS.uppercaseNoAmbiguous : CHARSETS.uppercase;
		chars += set;
	}
	
	if (options.includeLowercase) {
		const set = options.avoidAmbiguous ? CHARSETS.lowercaseNoAmbiguous : CHARSETS.lowercase;
		chars += set;
	}
	
	if (options.includeNumbers) {
		const set = options.avoidAmbiguous ? CHARSETS.numbersNoAmbiguous : CHARSETS.numbers;
		chars += set;
		// Add minimum required numbers
		for (let i = 0; i < options.minNumbers; i++) {
			requiredChars.push(set[Math.floor(Math.random() * set.length)]);
		}
	}
	
	if (options.includeSpecial) {
		chars += CHARSETS.special;
		// Add minimum required special characters
		for (let i = 0; i < options.minSpecial; i++) {
			requiredChars.push(CHARSETS.special[Math.floor(Math.random() * CHARSETS.special.length)]);
		}
	}

	if (chars.length === 0) {
		return '';
	}

	// Generate random bytes for password
	const randomBytesBuffer = randomBytes(options.length);
	const password: string[] = [];

	// Fill with random characters
	for (let i = 0; i < options.length; i++) {
		password.push(chars[randomBytesBuffer[i] % chars.length]);
	}

	// Insert required characters at random positions
	for (const reqChar of requiredChars) {
		const pos = Math.floor(Math.random() * options.length);
		password[pos] = reqChar;
	}

	return password.join('');
}
