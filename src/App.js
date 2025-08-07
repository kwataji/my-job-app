<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gemini 仕事進捗管理</title>
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- Inter Font -->
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Inter', sans-serif;
        }
        /* カスタムモーダルのスタイル */
        .modal-overlay {
            background-color: rgba(0, 0, 0, 0.5);
        }
        .modal-content {
            animation: fadeInScale 0.3s ease-out forwards;
        }
        @keyframes fadeInScale {
            from {
                opacity: 0;
                transform: scale(0.9);
            }
            to {
                opacity: 1;
                transform: scale(1);
            }
        }
    </style>
</head>
<body class="bg-gray-100 p-4">
    <div id="app" class="min-h-screen flex items-center justify-center">
        <p class="text-lg text-gray-700">認証中...</p>
    </div>

    <script>
        // Global state variables
        let currentJobs = [];
        let newJobTitle = '';
        let newJobType = '阪急'; // Default job type
        let selectedMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
        let currentUserId = 'anonymous_user'; // GASから取得するため初期値は仮
        let isAuthReady = false; // GASでの認証完了を待つ
        let showModal = false;
        let modalMessage = '';
        let modalType = 'info'; // 'info', 'deleteConfirm'
        let jobToDelete = null;
        let suggestedJobDetails = '';
        let isGenerating = false;

        // Update job types
        const JOB_TYPES = ['阪急', 'リール', 'その他'];

        // Filtering states
        let filterJobType = 'すべて';
        let filterCompletionStatus = 'すべて';

        // Render the main application UI
        const renderApp = () => {
            const appDiv = document.getElementById('app');
            if (!isAuthReady) {
                appDiv.innerHTML = `
                    <div class="flex items-center justify-center min-h-screen bg-gray-100">
                        <p class="text-lg text-gray-700">認証中...</p>
                    </div>
                `;
                return;
            }

            const monthOptionsHtml = generateMonthOptions().map(month => `
                <option value="${month}" ${month === selectedMonth ? 'selected' : ''}>${month}</option>
            `).join('');

            const filteredJobs = getFilteredJobs(); // フィルタリングされたジョブリストを取得

            const jobListHtml = filteredJobs.length === 0 ? `
                <p class="text-gray-600 text-center py-8">この月には、現在のフィルター条件に一致する仕事がありません。</p>
            ` : `
                <div class="space-y-4">
                    ${filteredJobs.map(job => `
                        <div class="p-5 rounded-lg shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between transition duration-300 ease-in-out
                            ${job.completed ? 'bg-green-50 border-l-4 border-green-500' :
                              job.inProgress ? 'bg-yellow-50 border-l-4 border-yellow-500' :
                              'bg-white border-l-4 border-gray-200'}`
                        }>
                            <div class="flex-grow mb-3 sm:mb-0">
                                <h3 class="text-lg font-medium text-gray-900">${job.title}</h3>
                                <p class="text-sm text-gray-600">
                                    <span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                                        job.type === '阪急' ? 'bg-blue-200 text-blue-800' :
                                        job.type === 'リール' ? 'bg-indigo-200 text-indigo-800' :
                                        'bg-gray-200 text-gray-800'
                                    } mr-2">${job.type}</span>
                                    ${job.inProgressDate ? `<span>入稿: ${new Date(job.inProgressDate).toLocaleDateString('ja-JP')}</span>` : ''}
                                    ${job.completedDate ? `<span>完了: ${new Date(job.completedDate).toLocaleDateString('ja-JP')}</span>` : ''}
                                </p>
                            </div>
                            <div class="flex flex-wrap gap-2">
                                <button
                                    onclick="updateJobStatus(${JSON.stringify(job.id)}, '${job.inProgress ? 'true' : 'false'}', 'inProgress')"
                                    class="py-2 px-4 rounded-full text-sm font-semibold shadow-sm transition duration-300 ease-in-out
                                        ${job.inProgress ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}"
                                >
                                    ${job.inProgress ? '入稿済み' : '入稿する'}
                                </button>
                                <button
                                    onclick="updateJobStatus(${JSON.stringify(job.id)}, '${job.completed ? 'true' : 'false'}', 'completed')"
                                    class="py-2 px-4 rounded-full text-sm font-semibold shadow-sm transition duration-300 ease-in-out
                                        ${job.completed ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}"
                                >
                                    ${job.completed ? '完了済み' : '完了する'}
                                </button>
                                <button
                                    onclick="confirmDeleteJob(${JSON.stringify(job.id)})"
                                    class="py-2 px-4 rounded-full text-sm font-semibold bg-red-100 hover:bg-red-200 text-red-700 shadow-sm transition duration-300 ease-in-out"
                                >
                                    削除
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;

            const jobTypeOptionsHtml = JOB_TYPES.map(type => `
                <option value="${type}" ${type === newJobType ? 'selected' : ''}>${type}</option>
            `).join('');

            const filterJobTypeOptionsHtml = ['すべて', ...JOB_TYPES].map(type => `
                <option value="${type}" ${type === filterJobType ? 'selected' : ''}>${type}</option>
            `).join('');

            const filterCompletionStatusOptionsHtml = ['すべて', '完了', '未完了'].map(status => `
                <option value="${status}" ${status === filterCompletionStatus ? 'selected' : ''}>${status}</option>
            `).join('');

            appDiv.innerHTML = `
                <div class="max-w-4xl mx-auto bg-white p-6 rounded-xl shadow-lg w-full">
                    <h1 class="text-3xl font-bold text-center text-gray-800 mb-6">Gemini 仕事進捗管理</h1>

                    <!-- ユーザーID表示 -->
                    <div class="text-sm text-gray-600 text-center mb-4 p-2 bg-gray-50 rounded-md">
                        ユーザーID: <span class="font-mono break-all">${currentUserId}</span>
                    </div>

                    <!-- 新しい仕事の追加フォーム -->
                    <div class="mb-8 p-4 bg-blue-50 rounded-lg shadow-inner">
                        <h2 class="text-xl font-semibold text-blue-800 mb-4">新しい仕事を追加</h2>
                        <div class="flex flex-col sm:flex-row gap-4">
                            <input
                                type="text"
                                placeholder="仕事のタイトル"
                                value="${newJobTitle}"
                                oninput="setNewJobTitle(event.target.value)"
                                class="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent transition duration-200"
                            />
                            <select
                                onchange="setNewJobType(event.target.value)"
                                class="p-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-400 focus:border-transparent transition duration-200"
                            >
                                ${jobTypeOptionsHtml}
                            </select>
                            <button
                                onclick="addJob()"
                                class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-full shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                            >
                                追加
                            </button>
                            <button
                                onclick="generateJobDetails()"
                                ${isGenerating ? 'disabled' : ''}
                                class="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-full shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                            >
                                ${isGenerating ? '生成中...' : '✨詳細を提案'}
                            </button>
                        </div>
                        ${suggestedJobDetails ? `
                            <div class="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                                <h3 class="text-md font-semibold text-green-800 mb-2">提案された仕事の詳細:</h3>
                                <textarea
                                    readonly
                                    class="w-full p-2 border border-gray-300 rounded-lg bg-white text-gray-700 h-24 resize-y"
                                >${suggestedJobDetails}</textarea>
                            </div>
                        ` : ''}
                    </div>

                    <!-- 月セレクターと翌月移動ボタン -->
                    <div class="flex flex-col sm:flex-row justify-between items-center mb-6 p-4 bg-gray-50 rounded-lg shadow-inner">
                        <label for="month-select" class="text-gray-700 font-medium mb-2 sm:mb-0">月を選択:</label>
                        <select
                            id="month-select"
                            onchange="handleMonthChange(event)"
                            class="p-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-400 focus:border-transparent transition duration-200 w-full sm:w-auto"
                        >
                            ${monthOptionsHtml}
                        </select>
                        <button
                            onclick="handleMoveCurrentMonthIncompleteJobs()"
                            class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-full shadow-md transition duration-300 ease-in-out transform hover:scale-105 mt-4 sm:mt-0"
                        >
                            完了していない仕事を翌月に移動
                        </button>
                    </div>

                    <!-- フィルタリングオプション -->
                    <div class="flex flex-col sm:flex-row gap-4 mb-6 p-4 bg-gray-50 rounded-lg shadow-inner">
                        <div class="flex-1">
                            <label for="filter-type" class="text-gray-700 font-medium mb-2 block">種類でフィルタリング:</label>
                            <select
                                id="filter-type"
                                onchange="setFilterJobType(event.target.value)"
                                class="p-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-400 focus:border-transparent transition duration-200 w-full"
                            >
                                ${filterJobTypeOptionsHtml}
                            </select>
                        </div>
                        <div class="flex-1">
                            <label for="filter-status" class="text-gray-700 font-medium mb-2 block">ステータスでフィルタリング:</label>
                            <select
                                id="filter-status"
                                onchange="setFilterCompletionStatus(event.target.value)"
                                class="p-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-400 focus:border-transparent transition duration-200 w-full"
                            >
                                ${filterCompletionStatusOptionsHtml}
                            </select>
                        </div>
                    </div>

                    <!-- 仕事リスト -->
                    <div>
                        <h2 class="text-2xl font-semibold text-gray-800 mb-4">仕事リスト (${selectedMonth})</h2>
                        ${jobListHtml}
                    </div>
                </div>

                <!-- モーダル -->
                ${showModal ? `
                    <div class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 modal-overlay">
                        <div class="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full text-center modal-content">
                            <p class="text-lg font-semibold mb-4">${modalMessage}</p>
                            ${modalType === 'deleteConfirm' ? `
                                <div class="flex justify-around">
                                    <button
                                        onclick="deleteJob()"
                                        class="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-full shadow-md transition duration-300 ease-in-out"
                                    >
                                        削除
                                    </button>
                                    <button
                                        onclick="closeModal()"
                                        class="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-full shadow-md transition duration-300 ease-in-out"
                                    >
                                        キャンセル
                                    </button>
                                </div>
                            ` : `
                                <button
                                    onclick="closeModal()"
                                    class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-full shadow-md transition duration-300 ease-in-out"
                                >
                                    閉じる
                                </button>
                            `}
                        </div>
                    </div>
                ` : ''}
            `;
        };

        // State update functions (mimicking React's setState)
        const updateState = (newState) => {
            // Update global variables
            for (const key in newState) {
                if (newState.hasOwnProperty(key)) {
                    window[key] = newState[key];
                }
            }
            renderApp(); // Re-render the UI
        };

        // Setters for state variables
        const setNewJobTitle = (value) => updateState({ newJobTitle: value });
        const setNewJobType = (value) => updateState({ newJobType: value });
        const setSelectedMonth = (value) => updateState({ selectedMonth: value });
        const setShowModal = (value) => updateState({ showModal: value });
        const setModalMessage = (value) => updateState({ modalMessage: value });
        const setModalType = (value) => updateState({ modalType: value });
        const setJobToDelete = (value) => updateState({ jobToDelete: value });
        const setSuggestedJobDetails = (value) => updateState({ suggestedJobDetails: value });
        const setIsGenerating = (value) => updateState({ isGenerating: value });
        const setFilterJobType = (value) => updateState({ filterJobType: value });
        const setFilterCompletionStatus = (value) => updateState({ filterCompletionStatus: value });


        // Filtered job list getter
        const getFilteredJobs = () => {
            return currentJobs.filter(job => {
                if (filterJobType !== 'すべて' && job.type !== filterJobType) {
                    return fa
