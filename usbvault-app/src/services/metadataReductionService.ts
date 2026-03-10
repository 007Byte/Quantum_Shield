/**
 * PH4-FIX: Stub for metadata reduction service.
 * TODO: Implement metadata stripping from files.
 */

export interface MetadataConfig {
  stripExif: boolean;
  stripGps: boolean;
  stripAuthor: boolean;
  stripDates: boolean;
}

export const DEFAULT_METADATA_CONFIG: MetadataConfig = {
  stripExif: true,
  stripGps: true,
  stripAuthor: true,
  stripDates: true,
};

class MetadataReductionServiceStub {
  async stripMetadata(_file: Uint8Array, _config?: MetadataConfig): Promise<Uint8Array> {
    return _file;
  }
}

export const metadataReductionService = new MetadataReductionServiceStub();
