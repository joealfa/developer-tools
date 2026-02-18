/**
 * Port & Process Manager type definitions
 */

export interface PortInfo {
    port: number;
    pid: number;
    processName: string;
    command: string;
    protocol: 'tcp' | 'tcp6';
    state: string;
}
