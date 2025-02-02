export function getTokenUrl(contractId: string, tokenId: string): string {
    return `https://nftnavigator.xyz/collection/${contractId}/token/${tokenId}`;
}

export function getPoolUrl(poolId: string): string {
    return `https://voi.humble.sh/#/swap?poolId=${poolId}`;
}

export function getAddLiquidityUrl(poolId: string): string {
    return `https://voi.humble.sh/#/pool/add?poolId=${poolId}`;
}

export function getAsaExplorerUrl(assetId: string): string {
    return `https://explorer.voi.network/explorer/asset/${assetId}`;
}

export function getVoiagerUrl(contractId: string): string {
    return `https://voiager.xyz/token/${contractId}`;
} 