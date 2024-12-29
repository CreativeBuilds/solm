import CryptoJS from 'crypto-js';

export function encrypt(data: string, password: string): string {
  return CryptoJS.AES.encrypt(data, password).toString();
}

export function decrypt(encryptedData: string, password: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, password);
  return bytes.toString(CryptoJS.enc.Utf8);
} 