/** One Shutterstock image on a page/layout that needs licensing before publish. */
export interface LicensingImage {
  shutterstockId: string;
  previewUrl: string;
  token: string;
  uses: number;
  /** Affiliate-attributed link to license this single asset on Shutterstock. */
  licenseUrl: string;
}

/** Response from the pages/layouts `/:id/licensing` endpoint. */
export interface LicensingResponse {
  images: LicensingImage[];
  /**
   * Whether the server can build a one-click "license all" Collection link on
   * demand (a collections.edit Shutterstock token is configured). The Generate
   * action is hidden when false.
   */
  collectionsEnabled: boolean;
}

/** Response from the pages/layouts `/:id/collection` (generate) endpoint. */
export interface GenerateCollectionResponse {
  /** Affiliate-wrapped Shutterstock Collection share link. */
  licenseAllUrl: string;
}
