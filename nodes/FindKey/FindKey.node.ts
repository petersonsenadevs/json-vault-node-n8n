import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import {
	validateKey,
	getNestedValue,
	countVaultKeys,
} from '../JsonVault/shared/vault-utils';

export class FindKey implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Find Key',
		name: 'findKey',
		icon: { light: 'file:find-key.svg', dark: 'file:find-key.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["key"]}}',
		description: 'Find and retrieve data by key from the JSON Vault',
		defaults: {
			name: 'Find Key',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		properties: [
			{
				displayName: 'Key',
				name: 'key',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'e.g., myData, users.list',
				description: 'The key to search for. Supports nested paths with dots (e.g., "users.admin").',
			},
			{
				displayName: 'Error if Not Exists',
				name: 'errorIfNotExists',
				type: 'boolean',
				default: false,
				description: 'Whether to throw an error if the key does not exist',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		
		// Asegurarse de usar staticData GLOBAL - compartido por todos los nodos
		const staticData = this.getWorkflowStaticData('global');
		
		// SEGURIDAD: FindKey SOLO LEE, NUNCA modifica el vault
		// Si el vault no existe, tratarlo como vacío
		if (staticData.jsonVault === undefined || typeof staticData.jsonVault !== 'object' || staticData.jsonVault === null) {
			// Vault no existe, retornar que no se encontró
			if (items.length === 0) {
				return [[{
					json: {
						key: '',
						found: false,
						value: null,
						success: true,
					},
				}]];
			}
			// Para cada item, retornar que no se encontró
			const returnData: INodeExecutionData[] = [];
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				const key = this.getNodeParameter('key', itemIndex, '') as string;
				const errorIfNotExists = this.getNodeParameter('errorIfNotExists', itemIndex, false) as boolean;
				
				if (errorIfNotExists && key) {
					throw new NodeOperationError(
						this.getNode(),
						`Key "${key}" does not exist in the vault`,
						{ itemIndex },
					);
				}
				
				returnData.push({
					json: {
						...items[itemIndex].json,
						key: key || '',
						found: false,
						value: null,
						success: true,
					},
					pairedItem: { item: itemIndex },
				});
			}
			return [returnData];
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const vault = staticData.jsonVault as Record<string, any>;

		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const key = this.getNodeParameter('key', itemIndex, '') as string;
				const errorIfNotExists = this.getNodeParameter('errorIfNotExists', itemIndex, false) as boolean;

				// Validar clave
				if (!key) {
					throw new NodeOperationError(
						this.getNode(),
						'Key is required and cannot be empty',
						{ itemIndex },
					);
				}

				if (!validateKey(key)) {
					throw new NodeOperationError(
						this.getNode(),
						'Invalid key format. Keys can only contain letters, numbers, dots, hyphens, and underscores',
						{ itemIndex },
					);
				}

				// Buscar el valor
				const isNested = key.includes('.');
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				let foundValue: any;

				if (isNested) {
					foundValue = getNestedValue(vault, key);
				} else {
					foundValue = vault[key];
				}

				// Verificar si existe
				if (foundValue === undefined) {
					if (errorIfNotExists) {
						throw new NodeOperationError(
							this.getNode(),
							`Key "${key}" does not exist in the vault`,
							{ itemIndex },
						);
					}
					// Si no existe y no se requiere error, retornar null
					foundValue = null;
				}

				// Crear item de salida con SOLO la información de la búsqueda
				// No incluir todo el vault, solo el valor encontrado
				const outputItem: INodeExecutionData = {
					json: {
						// Solo incluir datos del item anterior que no sean del vault
						...(items[itemIndex]?.json || {}),
						// Resultado de la búsqueda
						success: true,
						key,
						found: foundValue !== null && foundValue !== undefined,
						value: foundValue,
						// Información adicional útil
						vaultSize: countVaultKeys(vault),
					},
					pairedItem: { item: itemIndex },
				};

				returnData.push(outputItem);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							...items[itemIndex].json,
							error: error instanceof Error ? error.message : String(error),
							success: false,
						},
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				// Adding `itemIndex` allows other workflows to handle this error
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const err = error as any;
				if (err.context) {
					// If the error thrown already contains the context property,
					// only append the itemIndex
					err.context.itemIndex = itemIndex;
					throw error;
				}

				throw new NodeOperationError(this.getNode(), error, {
					itemIndex,
				});
			}
		}

		return [returnData];
	}
}

