import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { validateVaultSize } from './shared/vault-utils';

export class JsonVault implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'JSON Vault',
		name: 'jsonVault',
		icon: { light: 'file:json-vault.svg', dark: 'file:json-vault.dark.svg' },
		group: ['input'],
		version: 1,
		description: 'Central JSON storage vault accessible from anywhere in the workflow',
		defaults: {
			name: 'JSON Vault',
		},
		usableAsTool: true,
		inputs: [], // Nodo independiente sin conexiones de entrada
		outputs: [NodeConnectionTypes.Main], // Output para poder ejecutar manualmente, pero no requiere conexión
		properties: [
			{
				displayName: 'Action',
				name: 'action',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Initialize / View',
						value: 'init',
						action: 'Initialize the vault or view current data',
					},
					{
						name: 'Clear All',
						value: 'clear',
						action: 'Clear all data from the vault',
					},
				],
				default: 'init',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		// Obtener staticData del workflow GLOBAL - todos los nodos usan esto
		const staticData = this.getWorkflowStaticData('global');
		
		// Inicializar el vault si no existe
		if (!staticData.jsonVault || typeof staticData.jsonVault !== 'object') {
			staticData.jsonVault = {};
		}
		
		// Trabajar directamente sobre staticData.jsonVault (objeto compartido)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let vault = staticData.jsonVault as Record<string, any>;

		// Obtener acción (usa itemIndex 0, funciona aunque no haya items)
		const action = this.getNodeParameter('action', 0, 'init') as string;

		try {
			if (action === 'clear') {
				// Limpiar todo el vault
				vault = {};
				staticData.jsonVault = {};
			}
			// Para 'init', simplemente leer el vault existente (ya inicializado arriba)

			// Asegurarse de que siempre tenemos referencia al vault compartido
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			vault = staticData.jsonVault as Record<string, any>;

			// Validar tamaño
			validateVaultSize(vault);

			// Retornar los datos del vault para que sean accesibles mediante expresiones
			// Retorna el vault completo con todas las claves guardadas
			return [[{ json: vault }]];
		} catch (error) {
			if (error instanceof Error) {
				throw new NodeOperationError(this.getNode(), error.message);
			}
			throw error;
		}
	}
}
