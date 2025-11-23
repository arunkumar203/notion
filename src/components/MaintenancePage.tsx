import React from 'react';
import { FiTool } from 'react-icons/fi';

interface MaintenancePageProps {
    message?: string;
}

export default function MaintenancePage({ message }: MaintenancePageProps) {
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden transform transition-all hover:scale-105 duration-500">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 text-center">
                    <div className="mx-auto w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mb-4 shadow-inner">
                        <FiTool className="w-10 h-10 text-white animate-pulse" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">System Maintenance</h1>
                    <p className="text-blue-100 font-medium">We'll be back shortly</p>
                </div>

                <div className="p-8 text-center space-y-6">
                    <div className="space-y-2">
                        <p className="text-gray-600 text-lg leading-relaxed">
                            {message || "We're currently performing scheduled maintenance to improve your experience."}
                        </p>
                        <p className="text-gray-500 text-sm">
                            Please check back later.
                        </p>
                    </div>

                    <div className="pt-4 border-t border-gray-100">
                        <div className="flex items-center justify-center space-x-2 text-xs text-gray-400">
                            <span className="w-2 h-2 bg-yellow-400 rounded-full animate-ping"></span>
                            <span>System Update in Progress</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-8 text-center text-gray-400 text-sm">
                &copy; {new Date().getFullYear()} Notion Clone. All rights reserved.
            </div>
        </div>
    );
}
