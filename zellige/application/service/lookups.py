from zellige.application.port.persistence.unit_of_work import ReadRepositories
from zellige.domain.exception.domain_error import NotFoundError
from zellige.domain.model.branch import Branch
from zellige.domain.model.conversation import Conversation


def require_conversation(
    repositories: ReadRepositories, conversation_id: str
) -> Conversation:
    conversation = repositories.conversations.find_by_id(conversation_id)
    if conversation is None:
        raise NotFoundError("conversation_not_found", "conversation not found")
    return conversation


def require_branch(
    repositories: ReadRepositories, conversation_id: str, branch_id: str
) -> Branch:
    branch = repositories.branches.find_by_id(conversation_id, branch_id)
    if branch is None:
        raise NotFoundError("branch_not_found", "branch not found")
    return branch
