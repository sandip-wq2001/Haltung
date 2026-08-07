package com.haltung.backend

import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/profile")
class ProfileController(private val profiles: ProfileRepository) {

    @PostMapping(consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun save(@RequestBody payload: String): Map<String, String> {
        val saved = profiles.save(ProfileRow(payload = payload))
        return mapOf("id" to saved.id.toString(), "createdAt" to saved.createdAt.toString())
    }

    @GetMapping("/latest", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun latest(): ResponseEntity<String> {
        val row = profiles.findTopByOrderByIdDesc() ?: return ResponseEntity.notFound().build()
        return ResponseEntity.ok(row.payload)
    }
}
