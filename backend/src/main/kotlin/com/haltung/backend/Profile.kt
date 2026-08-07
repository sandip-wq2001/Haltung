package com.haltung.backend

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import org.springframework.data.jpa.repository.JpaRepository

@Entity
@Table(name = "profile")
class ProfileRow(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null,
    val createdAt: Instant = Instant.now(),
    @Column(columnDefinition = "TEXT", nullable = false)
    val payload: String,
)

interface ProfileRepository : JpaRepository<ProfileRow, Long> {
    fun findTopByOrderByIdDesc(): ProfileRow?
}
