import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

export class ClearJson implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Clear JSON',
		name: 'clearJson',
		icon: { light: 'file:clear-json.svg', dark: 'file:clear-json.dark.svg' },
		group: ['transform'],
		version: 1,
		description: 'Clear all data from the JSON Vault',
		defaults: {
			name: 'Clear JSON',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		properties: [
			{
				displayName: 'Clear Mode',
				name: 'clearMode',
				type: 'options',
				options: [
					{
						name: 'Clear All',
						value: 'all',
						description: 'Clear all data from the vault',
					},
					{
						name: 'Clear Specific Key',
						value: 'key',
						description: 'Clear a specific key',
					},
				],
				default: 'all',
				description: 'What to clear from the vault',
			},
			{
				displayName: 'Key',
				name: 'key',
				type: 'string',
				default: '',
				placeholder: 'e.g., myData, users.list',
				description: 'The key to clear (only used when Clear Mode is "Clear Specific Key")',
				displayOptions: {
					show: {
						clearMode: ['key'],
					},
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();

		// Asegurarse de usar staticData GLOBAL - compartido por todos los nodos
		const staticData = this.getWorkflowStaticData('global');

		// Inicializar el vault si no existe
		if (!staticData.jsonVault || typeof staticData.jsonVault !== 'object') {
			staticData.jsonVault = {};
		}

		// Trabajar directamente sobre staticData.jsonVault (objeto compartido)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const vault = staticData.jsonVault as Record<string, any>;

		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const clearMode = this.getNodeParameter('clearMode', itemIndex, 'all') as string;

				if (clearMode === 'all') {
					// Limpiar todo el vault
					Object.keys(vault).forEach((key) => {
						delete vault[key];
					});
					staticData.jsonVault = {};
				} else {
					// Limpiar una clave específica
					const key = this.getNodeParameter('key', itemIndex, '') as string;

					if (!key) {
						throw new NodeOperationError(
							this.getNode(),
							'Key is required when Clear Mode is "Clear Specific Key"',
							{ itemIndex },
						);
					}

					// Verificar si es ruta anidada
					if (key.includes('.')) {
						const keys = key.split('.');
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						let current: any = vault;

						for (let i = 0; i < keys.length - 1; i++) {
							if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
								// La ruta no existe
								break;
							}
							current = current[keys[i]];
						}

						const lastKey = keys[keys.length - 1];
						if (current && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, lastKey)) {
							delete current[lastKey];
						}
					} else {
						if (Object.prototype.hasOwnProperty.call(vault, key)) {
							delete vault[key];
						}
					}

					// Guardar cambios
					staticData.jsonVault = vault;
				}

				// Crear item de salida con información de la operación
				const outputItem: INodeExecutionData = {
					json: {
						...items[itemIndex].json,
						success: true,
						action: clearMode === 'all' ? 'cleared_all' : 'cleared_key',
						key: clearMode === 'key' ? this.getNodeParameter('key', itemIndex, '') : undefined,
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

		return [returnData];
	}
}

