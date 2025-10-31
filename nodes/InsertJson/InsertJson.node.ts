import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import {
	validateKey,
	safeJsonParse,
	getNestedValue,
	setNestedValue,
	validateVaultSize,
	deepMerge,
} from '../JsonVault/shared/vault-utils';

export class InsertJson implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Insert JSON',
		name: 'insertJson',
		icon: { light: 'file:insert-json.svg', dark: 'file:insert-json.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["key"]}}',
		description: 'Insert or replace JSON data in the JSON Vault',
		defaults: {
			name: 'Insert JSON',
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
				description: 'The key to store the JSON data. Supports nested paths with dots (e.g., "users.admin").',
			},
			{
				displayName: 'JSON Data',
				name: 'jsonData',
				type: 'json',
				required: true,
				default: '',
				description: 'The JSON object or value to insert. Can be a JSON string or object from previous node.',
			},
			{
				displayName: 'Merge Mode',
				name: 'mergeMode',
				type: 'options',
				options: [
					{
						name: 'Replace',
						value: 'replace',
						description: 'Replace the entire value at the key',
					},
					{
						name: 'Deep Merge',
						value: 'merge',
						description: 'Merge with existing object (only for objects)',
					},
				],
				default: 'replace',
				description: 'How to handle existing values at the key',
			},
			{
				displayName: 'Data Source',
				name: 'dataSource',
				type: 'options',
				options: [
					{
						name: 'Manual Entry',
						value: 'manual',
						description: 'Enter JSON data manually',
					},
					{
						name: 'From Input',
						value: 'input',
						description: 'Use data from previous node',
					},
				],
				default: 'manual',
				description: 'Where to get the JSON data from',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		
		// Asegurarse de usar staticData GLOBAL - compartido por todos los nodos
		const staticData = this.getWorkflowStaticData('global');
		
		// Inicializar el vault solo si realmente no existe (según documentación n8n)
		// CRÍTICO: Trabajar directamente sobre staticData.jsonVault para que n8n detecte los cambios
		if (staticData.jsonVault === undefined) {
			staticData.jsonVault = {};
		}
		
		// Trabajar DIRECTAMENTE sobre staticData.jsonVault (no crear referencia nueva)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const vault = staticData.jsonVault as Record<string, any>;

		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const key = this.getNodeParameter('key', itemIndex, '') as string;
				const mergeMode = this.getNodeParameter('mergeMode', itemIndex, 'replace') as string;
				const dataSource = this.getNodeParameter('dataSource', itemIndex, 'manual') as string;

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

				// Obtener el valor JSON
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				let jsonValue: any;

				if (dataSource === 'manual') {
					const jsonDataParam = this.getNodeParameter('jsonData', itemIndex) as string;
					if (typeof jsonDataParam === 'string') {
						jsonValue = safeJsonParse(jsonDataParam);
					} else {
						jsonValue = jsonDataParam;
					}
				} else {
					// Usar todo el JSON del item anterior
					jsonValue = items[itemIndex].json;
				}

				// Determinar si es una ruta anidada
				const isNested = key.includes('.');

				// Verificar si la clave ya existe (solo para mergeMode === 'replace')
				// Trabajar directamente sobre staticData.jsonVault
				if (mergeMode === 'replace') {
					let existingValue;
					if (isNested) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						existingValue = getNestedValue(staticData.jsonVault as Record<string, any>, key);
					} else {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const vaultRef = staticData.jsonVault as Record<string, any>;
						existingValue = vaultRef[key];
					}

					if (existingValue !== undefined) {
						throw new NodeOperationError(
							this.getNode(),
							`Key "${key}" already exists in the vault. Use Merge Mode to update existing keys or use Update JSON node.`,
							{ itemIndex },
						);
					}
				}

				// Trabajar DIRECTAMENTE sobre staticData.jsonVault para que n8n detecte los cambios
				if (isNested) {
					// Ruta anidada - trabajar sobre staticData directamente
					if (mergeMode === 'merge') {
						const existingValue = getNestedValue(staticData.jsonVault, key);
						if (existingValue !== undefined && typeof existingValue === 'object' && !Array.isArray(existingValue) && typeof jsonValue === 'object' && !Array.isArray(jsonValue)) {
							jsonValue = deepMerge(existingValue, jsonValue);
						}
					}
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					setNestedValue(staticData.jsonVault as Record<string, any>, key, jsonValue);
				} else {
					// Clave simple - trabajar directamente sobre staticData.jsonVault
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const vaultRef = staticData.jsonVault as Record<string, any>;
					if (mergeMode === 'merge' && vaultRef[key] !== undefined && typeof vaultRef[key] === 'object' && !Array.isArray(vaultRef[key]) && typeof jsonValue === 'object' && !Array.isArray(jsonValue)) {
						vaultRef[key] = deepMerge(vaultRef[key], jsonValue);
					} else {
						vaultRef[key] = jsonValue;
					}
				}

				// Los cambios ya están aplicados directamente sobre staticData.jsonVault
				// n8n detectará automáticamente los cambios al finalizar la ejecución exitosa

				// Validar tamaño
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				validateVaultSize(staticData.jsonVault as Record<string, any>);

				// Crear item de salida con información de la operación
				const outputItem: INodeExecutionData = {
					json: {
						...items[itemIndex].json,
						success: true,
						key,
						action: 'inserted',
						vaultSize: Object.keys(vault).length,
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
