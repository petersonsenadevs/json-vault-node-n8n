import type { IDataObject } from 'n8n-workflow';

/**
 * Obtiene el vault desde staticData, inicializándolo si no existe
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getVault(staticData: IDataObject): Record<string, any> {
	if (!staticData.jsonVault) {
		staticData.jsonVault = {};
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return staticData.jsonVault as Record<string, any>;
}

/**
 * Valida que una clave sea válida (solo letras, números, guiones y guiones bajos)
 */
export function validateKey(key: string): boolean {
	if (!key || typeof key !== 'string') {
		return false;
	}
	// Permite letras, números, guiones, guiones bajos y puntos para rutas anidadas
	return /^[a-zA-Z0-9_.-]+$/.test(key);
}

/**
 * Parsea de forma segura un string JSON
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeJsonParse(jsonString: string): any {
	try {
		return JSON.parse(jsonString);
	} catch {
		throw new Error('Invalid JSON format');
	}
}

/**
 * Obtiene un valor anidado de un objeto usando una ruta (ej: "users.admin")
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getNestedValue(obj: any, path: string): any {
	const keys = path.split('.');
	let current = obj;

	for (const key of keys) {
		if (current === undefined || current === null) {
			return undefined;
		}
		current = current[key];
	}

	return current;
}

/**
 * Establece un valor anidado en un objeto usando una ruta
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setNestedValue(obj: any, path: string, value: any): void {
	const keys = path.split('.');
	let current = obj;

	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i];
		if (!current[key] || typeof current[key] !== 'object') {
			current[key] = {};
		}
		current = current[key];
	}

	current[keys[keys.length - 1]] = value;
}

/**
 * Elimina un valor anidado de un objeto usando una ruta
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function deleteNestedValue(obj: any, path: string): boolean {
	const keys = path.split('.');
	let current = obj;

	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i];
		if (!current[key] || typeof current[key] !== 'object') {
			return false; // La ruta no existe
		}
		current = current[key];
	}

	const lastKey = keys[keys.length - 1];
	if (Object.prototype.hasOwnProperty.call(current, lastKey)) {
		delete current[lastKey];
		return true;
	}

	return false;
}

/**
 * Realiza un merge profundo de objetos
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function deepMerge(target: any, source: any): any {
	const output = { ...target };

	if (isObject(target) && isObject(source)) {
		Object.keys(source).forEach((key) => {
			if (isObject(source[key])) {
				if (!(key in target)) {
					Object.assign(output, { [key]: source[key] });
				} else {
					output[key] = deepMerge(target[key], source[key]);
				}
			} else {
				Object.assign(output, { [key]: source[key] });
			}
		});
	}

	return output;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isObject(item: any): boolean {
	return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Valida el tamaño del vault (límite de 10MB)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validateVaultSize(vault: Record<string, any>): void {
	const MAX_VAULT_SIZE = 10 * 1024 * 1024; // 10MB
	const vaultSize = JSON.stringify(vault).length;

	if (vaultSize > MAX_VAULT_SIZE) {
		throw new Error('Vault size limit exceeded (10MB maximum)');
	}
}

