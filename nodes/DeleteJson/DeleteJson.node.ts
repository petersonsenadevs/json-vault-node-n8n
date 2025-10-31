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
	deleteNestedValue,
	validateVaultSize,
} from '../JsonVault/shared/vault-utils';

export class DeleteJson implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Delete JSON',
		name: 'deleteJson',
		icon: { light: 'file:delete-json.svg', dark: 'file:delete-json.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["key"]}}',
		description: 'Delete JSON data from the JSON Vault',
		defaults: {
			name: 'Delete JSON',
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
				description: 'The key to delete. Supports nested paths with dots (e.g., "users.admin").',
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
		
		// Inicializar el vault si no existe (como en el ejemplo del usuario)
		if (!staticData.jsonVault) {
			staticData.jsonVault = {};
		}
		
		// Trabajar DIRECTAMENTE sobre staticData.jsonVault
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

				// Verificar si la clave existe y eliminar directamente
				const isNested = key.includes('.');
				let existed = false;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				let deletedValue: any;

				if (isNested) {
					const existingValue = getNestedValue(vault, key);
					if (existingValue !== undefined) {
						deletedValue = existingValue;
						existed = deleteNestedValue(vault, key);
						// Forzar detección: reasignar para que n8n detecte el cambio
						staticData.jsonVault = vault;
					} else if (errorIfNotExists) {
						throw new NodeOperationError(
							this.getNode(),
							`Key "${key}" does not exist in the vault`,
							{ itemIndex },
						);
					}
				} else {
					// Eliminación directa
					if (Object.prototype.hasOwnProperty.call(vault, key)) {
						deletedValue = vault[key];
						delete vault[key];
						existed = true;
						// Forzar detección: reasignar para que n8n detecte el cambio
						staticData.jsonVault = vault;
					} else if (errorIfNotExists) {
						throw new NodeOperationError(
							this.getNode(),
							`Key "${key}" does not exist in the vault`,
							{ itemIndex },
						);
					}
				}

				// Validar tamaño
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				validateVaultSize(staticData.jsonVault as Record<string, any>);

				// Crear item de salida con información de la operación
				const outputItem: INodeExecutionData = {
					json: {
						...items[itemIndex].json,
						success: true,
						key,
						action: 'deleted',
						existed,
						deletedValue: existed ? deletedValue : undefined,
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
