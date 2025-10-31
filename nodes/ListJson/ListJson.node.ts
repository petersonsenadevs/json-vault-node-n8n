import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import {
	getVaultWithoutMetadata,
	countVaultKeys,
} from '../JsonVault/shared/vault-utils';

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

		// Obtener vault sin metadata interna para mostrar al usuario
		const cleanVault = getVaultWithoutMetadata(vault);

		// PROTECCIÓN: Guardar snapshot del estado original del vault para validación
		// Usar el vault original de staticData (ya verificado arriba que existe)
		const vaultSnapshot = JSON.stringify(vault);

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
					// Retornar el vault completo (sin metadata)
					output = {
						vault: cleanVault,
						totalKeys: countVaultKeys(vault),
						totalKeysNested: includeNested ? getAllKeys(cleanVault).length : countVaultKeys(vault),
					};
				} else if (outputFormat === 'keys') {
					// Retornar solo las claves (sin metadata)
					if (includeNested) {
						const allKeys = getAllKeys(cleanVault);
						output = {
							keys: allKeys,
							count: allKeys.length,
						};
					} else {
						const keys = Object.keys(cleanVault);
						output = {
							keys: keys,
							count: keys.length,
						};
					}
				} else {
					// Retornar claves y valores (sin metadata)
					// NOTA: Cuando includeNested es true, solo mostramos las claves de primer nivel
					// para evitar duplicación. Si quieren ver anidados, pueden usar el formato 'vault'
					const keys = Object.keys(cleanVault);
					const keyValuePairs = keys.map((key) => ({
						key,
						value: cleanVault[key],
						isNested: false,
					}));
					output = {
						items: keyValuePairs,
						count: keyValuePairs.length,
					};
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

