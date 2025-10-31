import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

/**
 * Función helper para obtener todas las claves de un objeto, incluyendo rutas anidadas
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAllKeys(obj: any, prefix = ''): string[] {
	const keys: string[] = [];

	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			const fullKey = prefix ? `${prefix}.${key}` : key;
			keys.push(fullKey);

			if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
				// Recursivamente obtener claves anidadas
				keys.push(...getAllKeys(obj[key], fullKey));
			}
		}
	}

	return keys;
}

/**
 * Función helper para obtener el valor de una clave (puede ser anidada)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getValueByKey(obj: any, key: string): any {
	if (!key.includes('.')) {
		return obj[key];
	}

	const keys = key.split('.');
	let current = obj;

	for (const k of keys) {
		if (current === undefined || current === null || typeof current !== 'object') {
			return undefined;
		}
		current = current[k];
	}

	return current;
}

export class ListJson implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'List JSON',
		name: 'listJson',
		icon: { light: 'file:list-json.svg', dark: 'file:list-json.dark.svg' },
		group: ['transform'],
		version: 1,
		description: 'List all keys and values stored in the JSON Vault',
		defaults: {
			name: 'List JSON',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		properties: [
			{
				displayName: 'Output Format',
				name: 'outputFormat',
				type: 'options',
				options: [
					{
						name: 'Keys Only',
						value: 'keys',
						description: 'Return only the list of keys',
					},
					{
						name: 'Keys and Values',
						value: 'full',
						description: 'Return keys with their values',
					},
					{
						name: 'Full Vault',
						value: 'vault',
						description: 'Return the complete vault object',
					},
				],
				default: 'full',
				description: 'Format of the output data',
			},
			{
				displayName: 'Include Nested Keys',
				name: 'includeNested',
				type: 'boolean',
				default: true,
				description: 'Whether to include nested keys (e.g., "users.admin.settings")',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();

		// Asegurarse de usar staticData GLOBAL - compartido por todos los nodos
		const staticData = this.getWorkflowStaticData('global');

		// SEGURIDAD: ListJson SOLO LEE, NUNCA modifica el vault
		// Si el vault no existe (undefined), tratarlo como objeto vacío silenciosamente
		// Asegurar que siempre tengamos un objeto válido
		if (staticData.jsonVault === undefined || typeof staticData.jsonVault !== 'object' || staticData.jsonVault === null) {
			// Vault no existe o está corrupto, retornar vacío
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const emptyVault: Record<string, any> = {};
			return [[{
				json: {
					...(items.length > 0 ? items[0].json : {}),
					vault: emptyVault,
					keys: [],
					count: 0,
					success: true,
				},
				pairedItem: items.length > 0 ? { item: 0 } : undefined,
			}]];
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const vault = staticData.jsonVault as Record<string, any>;

		// PROTECCIÓN: Guardar snapshot del estado original del vault para validación
		// Usar el vault original de staticData, no el temporal
		const originalVault = staticData.jsonVault === undefined ? {} : staticData.jsonVault;
		const vaultSnapshot = JSON.stringify(originalVault);

		const returnData: INodeExecutionData[] = [];

		// Si no hay items de entrada, crear uno para procesar
		const itemsToProcess = items.length > 0 ? items : [{ json: {} }];

		for (let itemIndex = 0; itemIndex < itemsToProcess.length; itemIndex++) {
			try {
				const outputFormat = this.getNodeParameter('outputFormat', itemIndex, 'full') as string;
				const includeNested = this.getNodeParameter('includeNested', itemIndex, true) as boolean;

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				let output: any;

				if (outputFormat === 'vault') {
					// Retornar el vault completo
					output = {
						vault: vault,
						totalKeys: Object.keys(vault).length,
						totalKeysNested: includeNested ? getAllKeys(vault).length : Object.keys(vault).length,
					};
				} else if (outputFormat === 'keys') {
					// Retornar solo las claves
					if (includeNested) {
						output = {
							keys: getAllKeys(vault),
							count: getAllKeys(vault).length,
						};
					} else {
						output = {
							keys: Object.keys(vault),
							count: Object.keys(vault).length,
						};
					}
				} else {
					// Retornar claves y valores
					if (includeNested) {
						const allKeys = getAllKeys(vault);
						const keyValuePairs = allKeys.map((key) => ({
							key,
							value: getValueByKey(vault, key),
							isNested: key.includes('.'),
						}));
						output = {
							items: keyValuePairs,
							count: keyValuePairs.length,
						};
					} else {
						const keyValuePairs = Object.keys(vault).map((key) => ({
							key,
							value: vault[key],
							isNested: false,
						}));
						output = {
							items: keyValuePairs,
							count: keyValuePairs.length,
						};
					}
				}

				// Crear item de salida
				const outputItem: INodeExecutionData = {
					json: {
						...(itemsToProcess[itemIndex]?.json || {}),
						...output,
						success: true,
					},
					pairedItem: items.length > 0 ? { item: itemIndex } : undefined,
				};

				returnData.push(outputItem);
			} catch (error) {
				// SEGURIDAD: Verificar que el vault no se haya modificado
				const currentVaultState = JSON.stringify(staticData.jsonVault);
				if (currentVaultState !== vaultSnapshot) {
					// CRÍTICO: Si el vault cambió, restaurarlo desde el snapshot
					staticData.jsonVault = JSON.parse(vaultSnapshot);
				}

				if (this.continueOnFail()) {
					returnData.push({
						json: {
							...(itemsToProcess[itemIndex]?.json || {}),
							error: error instanceof Error ? error.message : String(error),
							success: false,
						},
						pairedItem: items.length > 0 ? { item: itemIndex } : undefined,
					});
					continue;
				}

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const err = error as any;
				if (err.context) {
					err.context.itemIndex = itemIndex;
					throw error;
				}

				throw new NodeOperationError(this.getNode(), error as Error, {
					itemIndex,
				});
			}
		}

		// SEGURIDAD FINAL: Verificar que el vault no se haya modificado después de todo el procesamiento
		// Solo verificar si el vault existe (no undefined)
		if (staticData.jsonVault !== undefined) {
			const finalVaultState = JSON.stringify(staticData.jsonVault);
			if (finalVaultState !== vaultSnapshot) {
				// Si cambió, restaurar (aunque no debería pasar nunca)
				staticData.jsonVault = JSON.parse(vaultSnapshot);
			}
		}

		// Si no hay items de entrada y no hay datos procesados, retornar estructura vacía silenciosamente
		if (returnData.length === 0 && items.length === 0) {
			return [[{
				json: {
					vault: vault,
					keys: Object.keys(vault),
					count: Object.keys(vault).length,
					success: true,
				},
			}]];
		}

		return [returnData];
	}
}

