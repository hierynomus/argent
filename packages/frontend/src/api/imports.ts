import type { ImportResult, ImportZipResult } from "@argent/shared"
import { http } from "./client"

export const importCamt053 = (file: File) => http.upload<ImportResult>("/import", file)

export const importCamt053Zip = (file: File) => http.upload<ImportZipResult>("/import/zip", file)
