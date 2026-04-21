// mobile-app/src/api/client.ts
// Phase 3 API Client pointing to Next.js Backend

// Assuming local testing with Expo via Android emulator (10.0.2.2) or iOS simulator/web (localhost)
import { Platform } from 'react-native';

export const API_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000/api' : 'http://localhost:3000/api';

class ApiClient {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_URL}${endpoint}`;
    
    // Abstract auth token retrieval for future completion
    const token = await this.getToken();
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {})
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[ApiClient] Failed to fetch ${endpoint}`, error);
      throw error;
    }
  }

  private async getToken(): Promise<string | null> {
    // Placeholder: integrate with AsyncStorage or SecureStore
    return null;
  }

  // --- Endpoints ---

  async registerPushToken(userId: string, token: string, platform: string) {
    return this.request('/users/push-tokens', {
      method: 'POST',
      body: JSON.stringify({ userId, token, platform })
    });
  }

  async askCopilot(userId: string, action: 'suggest_title' | 'suggest_description', prompt: string) {
    return this.request('/ai/copilot', {
      method: 'POST',
      body: JSON.stringify({ userId, action, prompt })
    });
  }

  async searchHelp(query: string) {
    return this.request('/ai/help', {
      method: 'POST',
      body: JSON.stringify({ query })
    });
  }
}

export const apiClient = new ApiClient();
