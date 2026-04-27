import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface AIContextType {
    pageContext: any;
    setPageContext: (context: any) => void;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

export const AIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [pageContext, setPageContext] = useState<any>(null);

    return (
        <AIContext.Provider value={{ pageContext, setPageContext }}>
            {children}
        </AIContext.Provider>
    );
};

export const useAI = () => {
    const context = useContext(AIContext);
    if (context === undefined) {
        throw new Error('useAI must be used within an AIProvider');
    }
    return context;
};
