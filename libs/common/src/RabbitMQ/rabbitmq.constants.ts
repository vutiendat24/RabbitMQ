export const EXCHANGE ={
    EMAIL_SERVICE_DIRECT: { name:'email_service.direct', type: 'direct'},
    USER_SERVICE_DIRECT: { name:'user_service.direct', type: 'direct'},
    LOGGING_SERVICE_FANOUT: { name:'logging_service.fanout', type: 'fanout'},
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
}as const