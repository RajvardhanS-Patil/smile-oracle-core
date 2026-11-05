'use client';

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { ethers } from 'ethers';

export interface User {
  id: string;
  wallet?: {
    address: string;
  };
}

export interface ConnectedWallet {
  address: string;
  chainId: string;
  getEthersProvider: () => Promise<ethers.providers.Web3Provider | any>;
  switchChain: (chainId: number) => Promise<void>;
}

interface AuthContextType {
  authenticated: boolean;
  user: User | null;
  wallets: ConnectedWallet[];
  login: () => void;
  logout: () => void;
  ready: boolean;
  isSimulated: boolean;
  usdcBalance: number;
  setUsdcBalance: React.Dispatch<React.SetStateAction<number>>;
  totalRaised: number;
  setTotalRaised: React.Dispatch<React.SetStateAction<number>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEMO_ADDRESS = '0x71C...B453';
const DEMO_FULL_ADDRESS = '0x71C94911E6afe5202F0DF2e6E50bE677F00EB453';
const BASE_CHAIN_ID = 8453;

// Create a simulated signer / provider for standalone testing
class SimulatedSigner {
  address: string;
  provider: any;

  constructor(address: string, provider: any) {
    this.address = address;
    this.provider = provider;
  }

  async getAddress(): Promise<string> {
    return this.address;
  }

  async getNetwork() {
    return { chainId: BASE_CHAIN_ID, name: 'base' };
  }
}

class SimulatedProvider {
  signer: SimulatedSigner;

  constructor(address: string) {
    this.signer = new SimulatedSigner(address, this);
  }

  getSigner() {
    return this.signer;
  }

  async getNetwork() {
    return { chainId: BASE_CHAIN_ID, name: 'base' };
  }

  async send(method: string, params: any[]) {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<User | null>(null);
  const [wallets, setWallets] = useState<ConnectedWallet[]>([]);
  const [ready, setReady] = useState<boolean>(false);
  const [isSimulated, setIsSimulated] = useState<boolean>(true);
  const [usdcBalance, setUsdcBalance] = useState<number>(10.0);
  const [totalRaised, setTotalRaised] = useState<number>(42.0);
  const [showConnectModal, setShowConnectModal] = useState<boolean>(false);

  useEffect(() => {
    // Check if user was previously connected in localStorage
    try {
      const savedAuth = localStorage.getItem('based_smiles_auth');
      if (savedAuth) {
        const parsed = JSON.parse(savedAuth);
        if (parsed.authenticated && parsed.address) {
          connectWallet(parsed.address, parsed.isSimulated ?? true);
        }
      }
    } catch (e) {
      console.warn('Could not read saved auth state:', e);
    }
    setReady(true);
  }, []);

  const connectWallet = (address: string, simulated: boolean = true) => {
    const userId = `did:privy:${address.toLowerCase()}`;
    const newUser: User = {
      id: userId,
      wallet: { address },
    };

    const walletObj: ConnectedWallet = {
      address,
      chainId: `eip155:${BASE_CHAIN_ID}`,
      getEthersProvider: async () => {
        if (!simulated && typeof window !== 'undefined' && (window as any).ethereum) {
          return new ethers.providers.Web3Provider((window as any).ethereum);
        }
        return new SimulatedProvider(address);
      },
      switchChain: async (chainId: number) => {
        if (!simulated && typeof window !== 'undefined' && (window as any).ethereum) {
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${chainId.toString(16)}` }],
          });
        }
      },
    };

    setUser(newUser);
    setWallets([walletObj]);
    setAuthenticated(true);
    setIsSimulated(simulated);

    try {
      localStorage.setItem(
        'based_smiles_auth',
        JSON.stringify({ authenticated: true, address, isSimulated: simulated })
      );
    } catch (e) {
      // ignore
    }
  };

  const login = () => {
    setShowConnectModal(true);
  };

  const logout = () => {
    setAuthenticated(false);
    setUser(null);
    setWallets([]);
    try {
      localStorage.removeItem('based_smiles_auth');
    } catch (e) {
      // ignore
    }
  };

  const handleConnectSimulated = () => {
    connectWallet(DEMO_FULL_ADDRESS, true);
    setShowConnectModal(false);
  };

  const handleConnectInjected = async () => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      try {
        const provider = new ethers.providers.Web3Provider((window as any).ethereum);
        const accounts = await provider.send('eth_requestAccounts', []);
        if (accounts && accounts.length > 0) {
          connectWallet(accounts[0], false);
          setShowConnectModal(false);
          return;
        }
      } catch (err) {
        console.error('Error connecting injected wallet:', err);
      }
    }
    // Fall back to simulated if no injected wallet available
    handleConnectSimulated();
  };

  const value = useMemo(
    () => ({
      authenticated,
      user,
      wallets,
      login,
      logout,
      ready,
      isSimulated,
      usdcBalance,
      setUsdcBalance,
      totalRaised,
      setTotalRaised,
    }),
    [authenticated, user, wallets, ready, isSimulated, usdcBalance, totalRaised]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}

      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#FFE5E5] border-[3px] border-black rounded-xl p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-sm w-full relative">
            <h3 className="text-2xl font-black text-center mb-2">Connect to Smile 😁</h3>
            <p className="text-sm font-medium text-center text-gray-700 mb-6">
              Connect your Web3 wallet to verify genuine smiles and win USDC rewards on Base!
            </p>

            <div className="space-y-3">
              <button
                onClick={handleConnectSimulated}
                className="w-full bg-[#90EE90] hover:bg-[#7CDF7C] text-black font-black py-3 px-4 border-[3px] border-black rounded-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] transition-all flex items-center justify-center gap-2"
              >
                <span>⚡ Quick Test Wallet (Base)</span>
              </button>

              {typeof window !== 'undefined' && (window as any).ethereum && (
                <button
                  onClick={handleConnectInjected}
                  className="w-full bg-[#FFD700] hover:bg-[#EEC200] text-black font-black py-3 px-4 border-[3px] border-black rounded-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] transition-all flex items-center justify-center gap-2"
                >
                  <img
                    src="https://avatars.githubusercontent.com/u/108554348?v=4"
                    alt="Base"
                    className="w-5 h-5 rounded-full border border-black"
                  />
                  <span>Browser Wallet (MetaMask/Base)</span>
                </button>
              )}

              <button
                onClick={() => setShowConnectModal(false)}
                className="w-full bg-white hover:bg-gray-100 text-black font-bold py-2 px-4 border-2 border-black rounded-lg text-sm mt-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const usePrivy = () => {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      authenticated: false,
      user: null,
      login: () => {},
      logout: () => {},
      ready: true,
      isSimulated: true,
    };
  }
  return {
    authenticated: context.authenticated,
    user: context.user,
    login: context.login,
    logout: context.logout,
    ready: context.ready,
    isSimulated: context.isSimulated,
  };
};

export const useWallets = () => {
  const context = useContext(AuthContext);
  return {
    wallets: context?.wallets || [],
  };
};

export const useAuthDetails = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthDetails must be used within AuthProvider');
  }
  return context;
};
