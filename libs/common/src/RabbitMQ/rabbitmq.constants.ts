export const EXCHANGE ={
    EMAIL_SERVICE_DIRECT: { name:'email_service.direct', type: 'direct'},
    USER_SERVICE_DIRECT: { name:'user_service.direct', type: 'direct'},
    LOGGING_SERVICE_FANOUT: { name:'logging_service.fanout', type: 'fanout'},
    DLX_EXCHANGE: { name: 'dlx.direct', type: 'direct' },
    RETRY_EXCHANGE: { name: 'retry.direct', type: 'direct' },
} as const

export const QUEUE = {
    EMAIL_SERVICE_QUEUE: { name:'email_service.queue', durable: true},
    USER_SERVICE_CREATE_USER_QUEUE: { name:'user_service.create_user_queue', durable: true},
    USER_SERVICE_UPDATE_USER_QUEUE: { name:'user_service.update_user_queue', durable: true},
    USER_SERVICE_DELETE_USER_QUEUE: { name:'user_service.delete_user_queue', durable: true},
    LOGGING_SERVICE_ERROR_QUEUE: { name:'logging_service.error_queue', durable: true},
    LOGGING_SERVICE_INFO_QUEUE: { name:'logging_service.info_queue', durable: true},
    LOGGING_SERVICE_WARN_QUEUE: { name:'logging_service.warn_queue', durable: true},
    LOGGING_SERVICE_ALL_QUEUE: { name:'logging_service.all_queue', durable: true},
    EMAIL_SERVICE_DLQ: { name: 'email_service.dlq', durable: true },
    // Retry queues - TTL tăng dần, hết TTL → đẩy lại main queue qua DLX
    EMAIL_RETRY_1: { name: 'email.retry.1', durable: true },  // TTL 5s
    EMAIL_RETRY_2: { name: 'email.retry.2', durable: true },  // TTL 15s
    EMAIL_RETRY_3: { name: 'email.retry.3', durable: true },  // TTL 30s
}as const

export const ROUTING_KEY = {
    EMAIL_SERVICE_SEND_EMAIL: 'email_service.send_email',
    USER_SERVICE_CREATE_USER: 'user_service.create_user',
    USER_SERVICE_UPDATE_USER: 'user_service.update_user',
    USER_SERVICE_DELETE_USER: 'user_service.delete_user',
    LOGGING_SERVICE_ALL_LOG: 'logging_service.#',
    LOGGING_SERVICE_ERROR_LOG: 'logging_service.error_log',
    LOGGING_SERVICE_INFO_LOG: 'logging_service.info_log',
    LOGGING_SERVICE_WARN_LOG: 'logging_service.warn_log',
    
}as const

export const BINDING_KEY = {
    EMAIL_SERVICE_SEND_EMAIL: 'email_service.send_email',
    USER_SERVICE_CREATE_USER: 'user_service.create_user',
    USER_SERVICE_UPDATE_USER: 'user_service.update_user',
    USER_SERVICE_DELETE_USER: 'user_service.delete_user',
    LOGGING_SERVICE_ALL_LOG: 'logging_service.#',
    LOGGING_SERVICE_ERROR_LOG: 'logging_service.error_log',
    LOGGING_SERVICE_INFO_LOG: 'logging_service.info_log',
    LOGGING_SERVICE_WARN_LOG: 'logging_service.warn_log',
    EMAIL_DLQ: 'email_service.dlq',
    // Retry routing keys
    EMAIL_RETRY_1: 'email.retry.1',
    EMAIL_RETRY_2: 'email.retry.2',
    EMAIL_RETRY_3: 'email.retry.3',
}as const

// Retry config cho dễ sử dụng
export const RETRY_CONFIG = {
    MAX_RETRIES: 3,
    QUEUES: [
        { queue: 'email.retry.1', routingKey: 'email.retry.1', ttl: 5000 },   // 5s
        { queue: 'email.retry.2', routingKey: 'email.retry.2', ttl: 15000 },  // 15s
        { queue: 'email.retry.3', routingKey: 'email.retry.3', ttl: 30000 },  // 30s
    ],
} as const;